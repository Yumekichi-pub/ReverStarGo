//+------------------------------------------------------------------+
//|                                                    StapojiEA.mq4 |
//|  "Stapoji" (Stack up Position If done) - backtest EA.             |
//|                                                                   |
//|  Rules taken from the author's own book:                          |
//|    - USDJPY, buy only, 1,000 units (0.01 lot) per order           |
//|    - Buy Stop ladder above the market                             |
//|    - First 1.0 yen of the ladder uses 0.5 yen spacing,            |
//|      everything above uses 0.2 yen spacing                        |
//|    - Trailing arms once price is +1.0 yen from the ladder base,   |
//|      initial trail width 0.5 yen                                  |
//|    - Every further fill widens the trail by 0.1 yen               |
//|    - Widening stops once the trail reaches 3.0 yen                |
//|                                                                   |
//|  Because every position trails the same market price with the     |
//|  same width, they all share one exit line:                        |
//|        exit = (highest price of the cycle) - (trail width)        |
//|  so the whole stack is closed together. That is one CYCLE.        |
//|  After a cycle closes, a new one starts from the current price.   |
//|                                                                   |
//|  Per-cycle results are printed and written to MQL4/Files as CSV,  |
//|  which is the point of the exercise: not one lucky run, but the   |
//|  distribution of many cycles over a long period.                  |
//|                                                                   |
//|  ASCII comments on purpose (mojibake safe in MetaEditor).         |
//+------------------------------------------------------------------+
#property copyright "ReverStarGo"
#property link      "https://reverstargo.com"
#property version   "1.00"
#property strict

//--- ladder --------------------------------------------------------
extern string _s1             = "--- ladder ---";
extern int    VolumeUnits     = 1000;   // per order, in currency units (1000 = 0.01 lot)
extern double StartOffsetYen  = 0.50;   // first Buy Stop this far above price at cycle start
extern double InitStepYen     = 0.50;   // spacing inside the first InitPhaseYen
extern double InitPhaseYen    = 1.00;   // how much of the ladder uses InitStepYen
extern double StepYen         = 0.20;   // spacing above that
extern double PreOrderYen     = 5.00;   // keep pending orders this far ahead of price
extern int    MaxPositions    = 0;      // 0 = unlimited

//--- trailing ------------------------------------------------------
extern string _s2             = "--- trailing ---";
extern double TrailStartYen   = 1.00;   // rise from ladder base that arms the trail
extern double TrailInitYen    = 0.50;   // trail width when it arms
extern double TrailWidenYen   = 0.10;   // widen per subsequent fill
extern double TrailMaxYen     = 3.00;   // stop widening here  <-- sweep this in optimisation

//--- housekeeping --------------------------------------------------
extern string _s3             = "--- housekeeping ---";
extern int    MagicNumber     = 20260901;
extern bool   WriteCsvLog     = true;
extern bool   VerboseLog      = false;  // log every fill (huge in a long test)

//--- cycle state ---------------------------------------------------
bool     g_active      = false;
int      g_cycle       = 0;
double   g_ladderBase  = 0.0;   // price of the first Buy Stop of this cycle
double   g_nextEntry   = 0.0;   // next ladder price still to be placed
double   g_maxPrice    = 0.0;   // highest Bid seen in this cycle
double   g_trail       = 0.0;   // current trail width
double   g_exitLine    = 0.0;   // monotonic exit price
bool     g_armed       = false;
int      g_posCount    = 0;     // our open positions right now
int      g_peakPos     = 0;     // peak within this cycle
datetime g_cycleStart  = 0;
double   g_startEquity = 0.0;

//--- run totals ----------------------------------------------------
int      g_cyclesDone   = 0;
int      g_cyclesWin    = 0;
double   g_totalProfit  = 0.0;
double   g_bestCycle    = 0.0;
double   g_worstCycle   = 0.0;
int      g_globalPeakPos= 0;
double   g_maxDrawdown  = 0.0;  // worst floating loss seen (equity below balance)

double   g_lots        = 0.01;
int      g_digits      = 3;
int      g_csv         = INVALID_HANDLE;

//+------------------------------------------------------------------+
int OnInit()
  {
   g_digits = (int)MarketInfo(Symbol(), MODE_DIGITS);

   double lotStep = MarketInfo(Symbol(), MODE_LOTSTEP);
   double minLot  = MarketInfo(Symbol(), MODE_MINLOT);
   if(lotStep <= 0.0) lotStep = 0.01;

   g_lots = VolumeUnits / 100000.0;
   g_lots = NormalizeDouble(MathFloor(g_lots / lotStep + 0.5) * lotStep, 2);
   if(g_lots < minLot)
     {
      Print("ABORT: VolumeUnits=", VolumeUnits, " -> ", DoubleToString(g_lots, 2),
            " lot is below MinLot=", DoubleToString(minLot, 2));
      return(INIT_PARAMETERS_INCORRECT);
     }

   Print("==================================================");
   Print("StapojiEA init  ", Symbol(), "  lot=", DoubleToString(g_lots, 2),
         " (", VolumeUnits, " units)");
   Print("Ladder : first ", DoubleToString(InitPhaseYen, 2), " yen at ",
         DoubleToString(InitStepYen, 2), ", then ", DoubleToString(StepYen, 2),
         ", pre-order ", DoubleToString(PreOrderYen, 2), " yen ahead");
   Print("Trail  : arm at +", DoubleToString(TrailStartYen, 2),
         ", init ", DoubleToString(TrailInitYen, 2),
         ", widen ", DoubleToString(TrailWidenYen, 2),
         " per fill, cap ", DoubleToString(TrailMaxYen, 2));
   Print("Account: balance=", DoubleToString(AccountBalance(), 2),
         " leverage=1:", AccountLeverage());
   Print("==================================================");

   if(WriteCsvLog)
      OpenCsv();

   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   //--- an unfinished cycle is still information: report it as open
   if(g_active && g_posCount > 0)
     {
      double open = OpenProfit();
      Print("--- cycle ", g_cycle, " still OPEN at end of test: ",
            g_posCount, " positions, floating ", DoubleToString(open, 0), " JPY");
      if(g_csv != INVALID_HANDLE)
         FileWrite(g_csv, g_cycle, TimeToString(g_cycleStart, TIME_DATE|TIME_MINUTES),
                   "OPEN", DoubleToString(g_ladderBase, g_digits),
                   DoubleToString(g_maxPrice, g_digits),
                   DoubleToString(Bid, g_digits), g_posCount, g_peakPos,
                   DoubleToString(g_trail, 2), DoubleToString(open, 0),
                   DoubleToString(g_totalProfit, 0));
     }

   Print("==================================================");
   Print("StapojiEA RESULT  ", Symbol());
   Print("  cycles closed    : ", g_cyclesDone, "  (profitable ", g_cyclesWin, ")");
   Print("  realised total   : ", DoubleToString(g_totalProfit, 0), " JPY");
   if(g_cyclesDone > 0)
      Print("  average / cycle  : ",
            DoubleToString(g_totalProfit / g_cyclesDone, 0), " JPY");
   Print("  best cycle       : ", DoubleToString(g_bestCycle, 0), " JPY");
   Print("  worst cycle      : ", DoubleToString(g_worstCycle, 0), " JPY");
   Print("  peak positions   : ", g_globalPeakPos,
         "  (= ", g_globalPeakPos * VolumeUnits, " units)");
   Print("  worst floating   : ", DoubleToString(-g_maxDrawdown, 0), " JPY");
   Print("  final balance    : ", DoubleToString(AccountBalance(), 0),
         "  equity ", DoubleToString(AccountEquity(), 0));
   Print("==================================================");

   if(g_csv != INVALID_HANDLE)
     {
      FileWrite(g_csv, "");
      FileWrite(g_csv, "cycles_closed", g_cyclesDone);
      FileWrite(g_csv, "cycles_profitable", g_cyclesWin);
      FileWrite(g_csv, "realised_total", DoubleToString(g_totalProfit, 0));
      FileWrite(g_csv, "best_cycle", DoubleToString(g_bestCycle, 0));
      FileWrite(g_csv, "worst_cycle", DoubleToString(g_worstCycle, 0));
      FileWrite(g_csv, "peak_positions", g_globalPeakPos);
      FileWrite(g_csv, "worst_floating", DoubleToString(-g_maxDrawdown, 0));
      FileWrite(g_csv, "trail_max_yen", DoubleToString(TrailMaxYen, 2));
      FileWrite(g_csv, "step_yen", DoubleToString(StepYen, 2));
      FileClose(g_csv);
      g_csv = INVALID_HANDLE;
     }
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   int before = g_posCount;
   Refresh();

   //--- floating drawdown watch
   double floating = AccountEquity() - AccountBalance();
   if(floating < -g_maxDrawdown)
      g_maxDrawdown = -floating;

   //--- start a cycle if none is running
   if(!g_active)
     {
      StartCycle();
      return;
     }

   //--- new fills since last tick
   int fills = g_posCount - before;
   if(fills > 0)
      OnFills(fills);

   if(g_posCount > g_peakPos)        g_peakPos = g_posCount;
   if(g_peakPos > g_globalPeakPos)   g_globalPeakPos = g_peakPos;

   //--- track the high water mark of the cycle
   if(Bid > g_maxPrice)
      g_maxPrice = Bid;

   //--- the single shared exit line, never allowed to move down
   if(g_armed)
     {
      double line = g_maxPrice - g_trail;
      if(line > g_exitLine)
         g_exitLine = line;

      if(g_posCount > 0 && Bid <= g_exitLine)
        {
         CloseCycle();
         return;
        }
     }

   //--- keep the ladder stocked ahead of price
   PlacePendings();
  }

//+------------------------------------------------------------------+
//| Start a new cycle at the current price.                          |
//+------------------------------------------------------------------+
void StartCycle()
  {
   g_cycle++;
   g_ladderBase  = NormalizeDouble(Ask + StartOffsetYen, g_digits);
   g_nextEntry   = g_ladderBase;
   g_maxPrice    = Bid;
   g_trail       = 0.0;
   g_exitLine    = 0.0;
   g_armed       = false;
   g_peakPos     = 0;
   g_cycleStart  = TimeCurrent();
   g_startEquity = AccountBalance();
   g_active      = true;

   Print("--- cycle ", g_cycle, " start ",
         TimeToString(TimeCurrent(), TIME_DATE|TIME_MINUTES),
         "  price=", DoubleToString(Bid, g_digits),
         "  ladder base=", DoubleToString(g_ladderBase, g_digits));

   PlacePendings();
  }

//+------------------------------------------------------------------+
//| React to newly filled orders: arm or widen the trail.            |
//+------------------------------------------------------------------+
void OnFills(int fills)
  {
   for(int i = 0; i < fills; i++)
     {
      if(!g_armed)
        {
         //--- the fill at base + TrailStartYen arms the trail.
         //--- compare against Ask: Buy Stops fill at Ask, so Bid would
         //--- sit one spread below the level and never satisfy this.
         if(Ask >= g_ladderBase + TrailStartYen - Point)
           {
            g_armed = true;
            g_trail = TrailInitYen;
            Print("    cycle ", g_cycle, " trail armed at ",
                  DoubleToString(Bid, g_digits),
                  " width ", DoubleToString(g_trail, 2));
           }
        }
      else if(g_trail < TrailMaxYen)
        {
         g_trail += TrailWidenYen;
         if(g_trail > TrailMaxYen)
            g_trail = TrailMaxYen;
        }
     }
   if(VerboseLog)
      Print("    cycle ", g_cycle, " fills=", fills, " total=", g_posCount,
            " trail=", DoubleToString(g_trail, 2));
  }

//+------------------------------------------------------------------+
//| Place Buy Stops up to PreOrderYen above the market.              |
//+------------------------------------------------------------------+
void PlacePendings()
  {
   double ceiling = Ask + PreOrderYen;
   int    guard   = 0;

   while(g_nextEntry <= ceiling && guard < 200)
     {
      guard++;

      if(MaxPositions > 0 && TotalMine() >= MaxPositions)
         return;

      double price = NormalizeDouble(g_nextEntry, g_digits);

      //--- a Buy Stop must sit above the market; if price ran past this
      //--- level, take it at market so the ladder keeps its shape
      int ticket;
      if(price <= Ask + MarketInfo(Symbol(), MODE_STOPLEVEL) * Point)
         ticket = OrderSend(Symbol(), OP_BUY, g_lots, Ask, 3, 0, 0,
                            "Stapoji", MagicNumber, 0, clrDodgerBlue);
      else
         ticket = OrderSend(Symbol(), OP_BUYSTOP, g_lots, price, 0, 0, 0,
                            "Stapoji", MagicNumber, 0, clrDodgerBlue);

      if(ticket < 0)
        {
         int err = GetLastError();
         if(err != 130 && err != 4107)
            Print("    OrderSend failed at ", DoubleToString(price, g_digits),
                  " err=", err);
         return;
        }

      //--- advance the ladder
      double step = (price - g_ladderBase < InitPhaseYen - 0.0001)
                    ? InitStepYen : StepYen;
      g_nextEntry = NormalizeDouble(price + step, g_digits);
     }
  }

//+------------------------------------------------------------------+
//| Close every position and cancel every pending order, then log.   |
//+------------------------------------------------------------------+
void CloseCycle()
  {
   double profit = 0.0;
   int    closed = 0;

   for(int pass = 0; pass < 50; pass++)
     {
      bool again = false;
      for(int i = OrdersTotal() - 1; i >= 0; i--)
        {
         if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))     continue;
         if(OrderMagicNumber() != MagicNumber)               continue;
         if(OrderSymbol() != Symbol())                       continue;

         if(OrderType() == OP_BUY)
           {
            double p = OrderProfit() + OrderSwap() + OrderCommission();
            if(OrderClose(OrderTicket(), OrderLots(), Bid, 3, clrOrangeRed))
              {
               profit += p;
               closed++;
              }
            else
               again = true;
           }
         else
           {
            if(!OrderDelete(OrderTicket(), clrGray))
               again = true;
           }
        }
      if(!again)
         break;
     }

   g_cyclesDone++;
   g_totalProfit += profit;
   if(profit > 0)             g_cyclesWin++;
   if(profit > g_bestCycle)   g_bestCycle  = profit;
   if(profit < g_worstCycle)  g_worstCycle = profit;

   double riseYen = g_maxPrice - g_ladderBase;

   Print("--- cycle ", g_cycle, " CLOSED ",
         TimeToString(TimeCurrent(), TIME_DATE|TIME_MINUTES),
         "  base=", DoubleToString(g_ladderBase, g_digits),
         " high=", DoubleToString(g_maxPrice, g_digits),
         " exit=", DoubleToString(Bid, g_digits),
         "  rise=", DoubleToString(riseYen, 2), " yen",
         "  positions=", closed,
         "  trail=", DoubleToString(g_trail, 2),
         "  profit=", DoubleToString(profit, 0), " JPY",
         "  cum=", DoubleToString(g_totalProfit, 0));

   if(g_csv != INVALID_HANDLE)
      FileWrite(g_csv, g_cycle,
                TimeToString(g_cycleStart, TIME_DATE|TIME_MINUTES),
                TimeToString(TimeCurrent(), TIME_DATE|TIME_MINUTES),
                DoubleToString(g_ladderBase, g_digits),
                DoubleToString(g_maxPrice, g_digits),
                DoubleToString(Bid, g_digits),
                closed, g_peakPos,
                DoubleToString(g_trail, 2),
                DoubleToString(profit, 0),
                DoubleToString(g_totalProfit, 0));

   g_active = false;
   Refresh();
  }

//+------------------------------------------------------------------+
//| Count our open positions (and refresh g_posCount).               |
//+------------------------------------------------------------------+
void Refresh()
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))  continue;
      if(OrderMagicNumber() != MagicNumber)            continue;
      if(OrderSymbol() != Symbol())                    continue;
      if(OrderType() == OP_BUY)                        n++;
     }
   g_posCount = n;
  }

//+------------------------------------------------------------------+
int TotalMine()
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))  continue;
      if(OrderMagicNumber() != MagicNumber)            continue;
      if(OrderSymbol() != Symbol())                    continue;
      n++;
     }
   return(n);
  }

//+------------------------------------------------------------------+
double OpenProfit()
  {
   double p = 0.0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))  continue;
      if(OrderMagicNumber() != MagicNumber)            continue;
      if(OrderSymbol() != Symbol())                    continue;
      if(OrderType() == OP_BUY)
         p += OrderProfit() + OrderSwap() + OrderCommission();
     }
   return(p);
  }

//+------------------------------------------------------------------+
void OpenCsv()
  {
   string name = StringConcatenate("Stapoji_", Symbol(), "_trail",
                                   DoubleToString(TrailMaxYen, 1), "_",
                                   GetTickCount());
   StringReplace(name, ".", "");
   StringReplace(name, " ", "_");
   name = name + ".csv";

   g_csv = FileOpen(name, FILE_WRITE | FILE_CSV | FILE_ANSI, ',');
   if(g_csv == INVALID_HANDLE)
     {
      Print("CSV log skipped, FileOpen failed err=", GetLastError());
      return;
     }
   FileWrite(g_csv, "cycle", "start", "end", "base", "high", "exit",
             "positions", "peak_positions", "trail", "profit_jpy", "cumulative_jpy");
   Print("CSV log: MQL4/Files/", name);
  }
//+------------------------------------------------------------------+
