//+------------------------------------------------------------------+
//|                                                    StapojiEA.mq4 |
//|  "Stapoji" (Stack up Position If done) - backtest EA.             |
//|                                                                   |
//|  UP PHASE (CHAPTER 3)                                             |
//|    Buy Stop ladder above the market. First 1.0 yen at 0.5 yen     |
//|    spacing, everything above at 0.2 yen. The trail arms once      |
//|    price is +1.0 yen from the ladder base, initial width 0.5 yen, |
//|    widening 0.1 yen per further fill, capped at 3.0 yen.          |
//|    Every position trails the same price with the same width, so   |
//|    they share ONE exit line:                                      |
//|        exit = (cycle high) - (trail width)                        |
//|    and the whole stack closes together. That is one CYCLE.        |
//|                                                                   |
//|  DOWN PHASE / SEEDING (CHAPTER 4)                                 |
//|    While price falls, buy VolumeUnits every SeedStepYen down.     |
//|    Seeds are ordinary positions: they are carried through the     |
//|    decline collecting swap, and they are closed together with     |
//|    the stack when the trail fires. They do NOT widen the trail.   |
//|                                                                   |
//|  SWAP                                                             |
//|    The MT4 tester applies TODAY's swap rate to the whole history, |
//|    which is useless over 2022-2026 where the US-JP rate gap went  |
//|    from ~0% to >5% and back. So this EA keeps its OWN swap ledger |
//|    from a policy-rate table (editable below) and reports it       |
//|    separately from price P/L. The tester's own swap is reported   |
//|    too, for comparison, but is NOT added to the result.           |
//|                                                                   |
//|  ASCII comments on purpose (mojibake safe in MetaEditor).         |
//+------------------------------------------------------------------+
#property copyright "ReverStarGo"
#property link      "https://reverstargo.com"
#property version   "2.00"
#property strict

//--- ladder (up phase) ---------------------------------------------
extern string _s1             = "--- up ladder ---";
extern int    VolumeUnits     = 1000;   // per order, currency units (1000 = 0.01 lot)
extern double StartOffsetYen  = 0.50;   // first Buy Stop above price at cycle start
extern double InitStepYen     = 0.50;   // spacing inside the first InitPhaseYen
extern double InitPhaseYen    = 1.00;   // how much of the ladder uses InitStepYen
extern double StepYen         = 0.20;   // spacing above that
extern double PreOrderYen     = 5.00;   // keep pendings this far ahead of price

//--- seeding (down phase) ------------------------------------------
extern string _s2             = "--- seeding (down phase) ---";
extern bool   SeedEnabled     = true;   // buy on the way down
extern double SeedStepYen     = 0.50;   // one order per this much decline
extern int    SeedMaxCount    = 0;      // 0 = unlimited

//--- trailing ------------------------------------------------------
extern string _s3             = "--- trailing ---";
extern double TrailStartYen   = 1.00;   // rise from ladder base that arms the trail
extern double TrailInitYen    = 0.50;   // trail width when it arms
extern double TrailWidenYen   = 0.10;   // widen per subsequent up-ladder fill
extern double TrailMaxYen     = 3.00;   // stop widening here  <-- sweep in optimisation

//--- swap ledger ---------------------------------------------------
extern string _s4             = "--- swap ledger ---";
extern bool   OwnSwapLedger   = true;   // compute swap from the rate table below
extern double SwapEfficiency  = 0.80;   // fraction of the rate gap the broker passes on
extern bool   TripleWednesday = true;   // 3x swap on Wednesday (value-date roll)

//--- housekeeping --------------------------------------------------
extern string _s5             = "--- housekeeping ---";
extern int    MaxPositions    = 0;      // 0 = unlimited
extern int    MagicNumber     = 20260901;
extern bool   WriteCsvLog     = true;
extern bool   VerboseLog      = false;

//+------------------------------------------------------------------+
//| Policy rate table.                                                |
//|                                                                   |
//| Fed upper target and BoJ policy rate, in percent, from the date   |
//| the change took effect. Swap per day is estimated as              |
//|     (usd - jpy) / 100 * notional_in_JPY / 365 * SwapEfficiency    |
//|                                                                   |
//| These are POLICY rates, not Rakuten's published swap. They give   |
//| the right shape and order of magnitude (about 16-20 JPY/day per   |
//| 1,000 USD at a 5% gap and USDJPY 150). If you want the real       |
//| numbers, replace this table with Rakuten's published daily swap.  |
//| Entries from 2025 onward in particular are worth verifying.       |
//+------------------------------------------------------------------+
#define RATE_ROWS 40
string   g_rateDate[RATE_ROWS];
double   g_rateUsd [RATE_ROWS];
double   g_rateJpy [RATE_ROWS];
datetime g_rateTime[RATE_ROWS];
int      g_rateN = 0;

void AddRate(string d, double usd, double jpy)
  {
   if(g_rateN >= RATE_ROWS) return;
   g_rateDate[g_rateN] = d;
   g_rateUsd [g_rateN] = usd;
   g_rateJpy [g_rateN] = jpy;
   g_rateTime[g_rateN] = StringToTime(d);
   g_rateN++;
  }

void BuildRateTable()
  {
   g_rateN = 0;
   //        date            Fed   BoJ
   AddRate("2007.01.01",     5.25,  0.25);
   AddRate("2007.02.21",     5.25,  0.50);
   AddRate("2007.09.18",     4.75,  0.50);
   AddRate("2007.12.11",     4.25,  0.50);
   AddRate("2008.03.18",     2.25,  0.50);
   AddRate("2008.10.08",     1.50,  0.50);
   AddRate("2008.10.31",     1.00,  0.30);
   AddRate("2008.12.16",     0.25,  0.30);
   AddRate("2008.12.19",     0.25,  0.10);
   AddRate("2015.12.16",     0.50,  0.10);
   AddRate("2016.02.16",     0.50, -0.10);
   AddRate("2016.12.14",     0.75, -0.10);
   AddRate("2017.03.15",     1.00, -0.10);
   AddRate("2017.06.14",     1.25, -0.10);
   AddRate("2017.12.13",     1.50, -0.10);
   AddRate("2018.03.21",     1.75, -0.10);
   AddRate("2018.06.13",     2.00, -0.10);
   AddRate("2018.09.26",     2.25, -0.10);
   AddRate("2018.12.19",     2.50, -0.10);
   AddRate("2019.08.01",     2.25, -0.10);
   AddRate("2019.09.19",     2.00, -0.10);
   AddRate("2019.10.31",     1.75, -0.10);
   AddRate("2020.03.16",     0.25, -0.10);
   AddRate("2022.03.17",     0.50, -0.10);
   AddRate("2022.05.05",     1.00, -0.10);
   AddRate("2022.06.16",     1.75, -0.10);
   AddRate("2022.07.28",     2.50, -0.10);
   AddRate("2022.09.22",     3.25, -0.10);
   AddRate("2022.11.03",     4.00, -0.10);
   AddRate("2022.12.15",     4.50, -0.10);
   AddRate("2023.02.02",     4.75, -0.10);
   AddRate("2023.03.23",     5.00, -0.10);
   AddRate("2023.05.04",     5.25, -0.10);
   AddRate("2023.07.27",     5.50, -0.10);
   AddRate("2024.03.19",     5.50,  0.10);
   AddRate("2024.07.31",     5.50,  0.25);
   AddRate("2024.09.19",     5.00,  0.25);
   AddRate("2024.11.08",     4.75,  0.25);
   AddRate("2024.12.19",     4.50,  0.25);
   AddRate("2025.01.24",     4.50,  0.50);
  }

double RateGapPercent(datetime t)
  {
   double gap = 0.0;
   for(int i = 0; i < g_rateN; i++)
     {
      if(t >= g_rateTime[i])
         gap = g_rateUsd[i] - g_rateJpy[i];
      else
         break;
     }
   return(gap);
  }

//--- cycle state ---------------------------------------------------
bool     g_active      = false;
int      g_cycle       = 0;
double   g_cycleOpen   = 0.0;   // price when the cycle started
double   g_ladderBase  = 0.0;   // price of the first Buy Stop of this cycle
double   g_nextEntry   = 0.0;   // next up-ladder price still to be placed
double   g_nextSeed    = 0.0;   // next price at which to seed on the way down
int      g_seedCount   = 0;     // seeds bought in this cycle
double   g_maxPrice    = 0.0;
double   g_minPrice    = 0.0;
double   g_trail       = 0.0;
double   g_exitLine    = 0.0;
bool     g_armed       = false;
int      g_posCount    = 0;
int      g_peakPos     = 0;
datetime g_cycleStart  = 0;
double   g_swapCycle   = 0.0;   // our own swap accrued inside this cycle

//--- run totals ----------------------------------------------------
int      g_cyclesDone   = 0;
int      g_cyclesWin    = 0;
double   g_totalPrice   = 0.0;  // realised price P/L, our-swap excluded
double   g_totalSwap    = 0.0;  // our own swap ledger
double   g_testerSwap   = 0.0;  // what the tester thought, for comparison
double   g_bestCycle    = 0.0;
double   g_worstCycle   = 0.0;
int      g_globalPeakPos= 0;
int      g_globalSeeds  = 0;
double   g_maxFloatLoss = 0.0;
double   g_minMarginLvl = 1e12;
datetime g_minMarginAt  = 0;

double   g_lots        = 0.01;
int      g_digits      = 3;
int      g_csv         = INVALID_HANDLE;
datetime g_lastAccrual = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   BuildRateTable();
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
   Print("StapojiEA v2  ", Symbol(), "  lot=", DoubleToString(g_lots, 2),
         " (", VolumeUnits, " units)");
   Print("Up ladder : first ", DoubleToString(InitPhaseYen, 2), " yen at ",
         DoubleToString(InitStepYen, 2), ", then ", DoubleToString(StepYen, 2));
   Print("Seeding   : ", (SeedEnabled ? "ON" : "OFF"),
         " every ", DoubleToString(SeedStepYen, 2), " yen down",
         (SeedMaxCount > 0 ? StringConcatenate(", max ", SeedMaxCount) : ", unlimited"));
   Print("Trail     : arm at +", DoubleToString(TrailStartYen, 2),
         ", init ", DoubleToString(TrailInitYen, 2),
         ", widen ", DoubleToString(TrailWidenYen, 2),
         " per fill, cap ", DoubleToString(TrailMaxYen, 2));
   Print("Swap      : ", (OwnSwapLedger ? "own ledger" : "tester only"),
         ", efficiency ", DoubleToString(SwapEfficiency, 2),
         ", triple Wed ", (TripleWednesday ? "yes" : "no"),
         ", rate rows ", g_rateN);
   Print("Account   : balance=", DoubleToString(AccountBalance(), 0),
         " leverage=1:", AccountLeverage());
   Print("==================================================");

   if(WriteCsvLog)
      OpenCsv();

   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   if(g_active && g_posCount > 0)
     {
      double open = OpenPriceProfit();
      Print("--- cycle ", g_cycle, " still OPEN at end of test: ", g_posCount,
            " positions, floating ", DoubleToString(open, 0),
            " JPY, swap so far ", DoubleToString(g_swapCycle, 0), " JPY");
      if(g_csv != INVALID_HANDLE)
         FileWrite(g_csv, g_cycle,
                   TimeToString(g_cycleStart, TIME_DATE|TIME_MINUTES), "OPEN",
                   DoubleToString(g_ladderBase, g_digits),
                   DoubleToString(g_maxPrice, g_digits),
                   DoubleToString(g_minPrice, g_digits),
                   DoubleToString(Bid, g_digits),
                   g_posCount, g_seedCount, g_peakPos,
                   DoubleToString(g_trail, 2),
                   DoubleToString(open, 0),
                   DoubleToString(g_swapCycle, 0),
                   DoubleToString(open + g_swapCycle, 0),
                   DoubleToString(g_totalPrice + g_totalSwap, 0));
     }

   double total = g_totalPrice + g_totalSwap;

   Print("==================================================");
   Print("StapojiEA RESULT  ", Symbol());
   Print("  cycles closed      : ", g_cyclesDone, "  (profitable ", g_cyclesWin, ")");
   Print("  realised price P/L : ", DoubleToString(g_totalPrice, 0), " JPY");
   Print("  own swap ledger    : ", DoubleToString(g_totalSwap, 0), " JPY");
   Print("  --> total          : ", DoubleToString(total, 0), " JPY");
   if(g_cyclesDone > 0)
      Print("  average / cycle    : ",
            DoubleToString(total / g_cyclesDone, 0), " JPY");
   Print("  best  cycle        : ", DoubleToString(g_bestCycle, 0), " JPY");
   Print("  worst cycle        : ", DoubleToString(g_worstCycle, 0), " JPY");
   Print("  peak positions     : ", g_globalPeakPos,
         " (= ", g_globalPeakPos * VolumeUnits, " units)");
   Print("  seeds bought       : ", g_globalSeeds);
   Print("  worst floating     : ", DoubleToString(-g_maxFloatLoss, 0), " JPY");
   Print("  min margin level   : ",
         (g_minMarginLvl > 1e11 ? "n/a" : DoubleToString(g_minMarginLvl, 1) + " %"),
         (g_minMarginAt > 0
          ? "  at " + TimeToString(g_minMarginAt, TIME_DATE) : ""));
   Print("  (tester's own swap, NOT counted: ",
         DoubleToString(g_testerSwap, 0), " JPY)");
   Print("==================================================");

   if(g_csv != INVALID_HANDLE)
     {
      FileWrite(g_csv, "");
      FileWrite(g_csv, "cycles_closed",      g_cyclesDone);
      FileWrite(g_csv, "cycles_profitable",  g_cyclesWin);
      FileWrite(g_csv, "realised_price_pl",  DoubleToString(g_totalPrice, 0));
      FileWrite(g_csv, "own_swap_total",     DoubleToString(g_totalSwap, 0));
      FileWrite(g_csv, "total",              DoubleToString(total, 0));
      FileWrite(g_csv, "best_cycle",         DoubleToString(g_bestCycle, 0));
      FileWrite(g_csv, "worst_cycle",        DoubleToString(g_worstCycle, 0));
      FileWrite(g_csv, "peak_positions",     g_globalPeakPos);
      FileWrite(g_csv, "seeds_bought",       g_globalSeeds);
      FileWrite(g_csv, "worst_floating",     DoubleToString(-g_maxFloatLoss, 0));
      FileWrite(g_csv, "min_margin_level",
                (g_minMarginLvl > 1e11 ? "n/a" : DoubleToString(g_minMarginLvl, 1)));
      FileWrite(g_csv, "tester_swap_ignored", DoubleToString(g_testerSwap, 0));
      FileWrite(g_csv, "trail_max_yen",      DoubleToString(TrailMaxYen, 2));
      FileWrite(g_csv, "step_yen",           DoubleToString(StepYen, 2));
      FileWrite(g_csv, "seed_step_yen",      DoubleToString(SeedStepYen, 2));
      FileClose(g_csv);
      g_csv = INVALID_HANDLE;
     }
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   int before = g_posCount;
   Refresh();

   AccrueSwap();
   WatchRisk();

   if(!g_active)
     {
      StartCycle();
      return;
     }

   //--- pending-order fills since last tick (seeds are counted at the
   //--- end of the tick that bought them, so they never show up here)
   int fills = g_posCount - before;
   if(fills > 0)
      OnFills(fills);

   if(g_posCount > g_peakPos)      g_peakPos = g_posCount;
   if(g_peakPos > g_globalPeakPos) g_globalPeakPos = g_peakPos;

   if(Bid > g_maxPrice) g_maxPrice = Bid;
   if(Bid < g_minPrice) g_minPrice = Bid;

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

   PlacePendings();
   DoSeeding();
  }

//+------------------------------------------------------------------+
void StartCycle()
  {
   g_cycle++;
   g_cycleOpen   = Bid;
   g_ladderBase  = NormalizeDouble(Ask + StartOffsetYen, g_digits);
   g_nextEntry   = g_ladderBase;
   g_nextSeed    = NormalizeDouble(Bid - SeedStepYen, g_digits);
   g_seedCount   = 0;
   g_maxPrice    = Bid;
   g_minPrice    = Bid;
   g_trail       = 0.0;
   g_exitLine    = 0.0;
   g_armed       = false;
   g_peakPos     = 0;
   g_swapCycle   = 0.0;
   g_cycleStart  = TimeCurrent();
   g_active      = true;

   Print("--- cycle ", g_cycle, " start ",
         TimeToString(TimeCurrent(), TIME_DATE|TIME_MINUTES),
         "  price=", DoubleToString(Bid, g_digits),
         "  ladder base=", DoubleToString(g_ladderBase, g_digits));

   PlacePendings();
   DoSeeding();
  }

//+------------------------------------------------------------------+
//| Up-ladder fills arm or widen the trail. Seeds never do.          |
//+------------------------------------------------------------------+
void OnFills(int fills)
  {
   for(int i = 0; i < fills; i++)
     {
      if(!g_armed)
        {
         //--- Buy Stops fill at Ask, so compare against Ask
         if(Ask >= g_ladderBase + TrailStartYen - Point)
           {
            g_armed = true;
            g_trail = TrailInitYen;
            Print("    cycle ", g_cycle, " trail armed at ",
                  DoubleToString(Ask, g_digits),
                  " width ", DoubleToString(g_trail, 2),
                  " positions ", g_posCount);
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
      int    ticket;

      //--- if price already ran past this level, take it at market so
      //--- the ladder keeps its shape through a gap
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

      double step = (price - g_ladderBase < InitPhaseYen - 0.0001)
                    ? InitStepYen : StepYen;
      g_nextEntry = NormalizeDouble(price + step, g_digits);
     }
  }

//+------------------------------------------------------------------+
//| Seeding: buy one lot for every SeedStepYen the market falls.     |
//| Bought at market, so they are counted before the next tick.      |
//+------------------------------------------------------------------+
void DoSeeding()
  {
   if(!SeedEnabled)
      return;

   int guard = 0;
   while(Bid <= g_nextSeed && guard < 50)
     {
      guard++;
      if(SeedMaxCount > 0 && g_seedCount >= SeedMaxCount)          return;
      if(MaxPositions  > 0 && TotalMine() >= MaxPositions)         return;

      int ticket = OrderSend(Symbol(), OP_BUY, g_lots, Ask, 3, 0, 0,
                             "StapojiSeed", MagicNumber, 0, clrOrange);
      if(ticket < 0)
        {
         Print("    seed OrderSend failed at ", DoubleToString(Ask, g_digits),
               " err=", GetLastError());
         return;
        }

      g_seedCount++;
      g_globalSeeds++;
      if(VerboseLog)
         Print("    cycle ", g_cycle, " SEED #", g_seedCount, " at ",
               DoubleToString(Ask, g_digits));

      g_nextSeed = NormalizeDouble(g_nextSeed - SeedStepYen, g_digits);
     }

   Refresh();
   if(g_posCount > g_peakPos)      g_peakPos = g_posCount;
   if(g_peakPos > g_globalPeakPos) g_globalPeakPos = g_peakPos;
  }

//+------------------------------------------------------------------+
//| Our own swap ledger: accrue once per calendar day.               |
//+------------------------------------------------------------------+
void AccrueSwap()
  {
   if(!OwnSwapLedger || g_posCount <= 0)
     {
      g_lastAccrual = TimeCurrent();
      return;
     }

   datetime now   = TimeCurrent();
   int      today = TimeDay(now) + TimeMonth(now) * 100 + TimeYear(now) * 10000;
   int      last  = TimeDay(g_lastAccrual) + TimeMonth(g_lastAccrual) * 100
                    + TimeYear(g_lastAccrual) * 10000;
   if(today == last)
      return;
   g_lastAccrual = now;

   double gap = RateGapPercent(now);
   if(gap == 0.0)
      return;

   double notionalPerLot = VolumeUnits * Bid;              // JPY per position
   double perDay = gap / 100.0 * notionalPerLot / 365.0 * SwapEfficiency;

   double mult = 1.0;
   if(TripleWednesday && TimeDayOfWeek(now) == 3)
      mult = 3.0;

   double add = perDay * g_posCount * mult;
   g_swapCycle += add;
   g_totalSwap += add;
  }

//+------------------------------------------------------------------+
void WatchRisk()
  {
   double floating = AccountEquity() - AccountBalance();
   if(floating < -g_maxFloatLoss)
      g_maxFloatLoss = -floating;

   double margin = AccountMargin();
   if(margin > 0.0)
     {
      double lvl = AccountEquity() / margin * 100.0;
      if(lvl < g_minMarginLvl)
        {
         g_minMarginLvl = lvl;
         g_minMarginAt  = TimeCurrent();
        }
     }
  }

//+------------------------------------------------------------------+
void CloseCycle()
  {
   double priceProfit = 0.0;
   double testerSwap  = 0.0;
   int    closed      = 0;

   for(int pass = 0; pass < 50; pass++)
     {
      bool again = false;
      for(int i = OrdersTotal() - 1; i >= 0; i--)
        {
         if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))  continue;
         if(OrderMagicNumber() != MagicNumber)            continue;
         if(OrderSymbol() != Symbol())                    continue;

         if(OrderType() == OP_BUY)
           {
            double p = OrderProfit() + OrderCommission();
            double s = OrderSwap();
            if(OrderClose(OrderTicket(), OrderLots(), Bid, 3, clrOrangeRed))
              {
               priceProfit += p;
               testerSwap  += s;
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

   double cycleTotal = priceProfit + g_swapCycle;

   g_cyclesDone++;
   g_totalPrice += priceProfit;
   g_testerSwap += testerSwap;
   if(cycleTotal > 0)            g_cyclesWin++;
   if(cycleTotal > g_bestCycle)  g_bestCycle  = cycleTotal;
   if(cycleTotal < g_worstCycle) g_worstCycle = cycleTotal;

   Print("--- cycle ", g_cycle, " CLOSED ",
         TimeToString(TimeCurrent(), TIME_DATE|TIME_MINUTES),
         "  base=", DoubleToString(g_ladderBase, g_digits),
         " low=",   DoubleToString(g_minPrice, g_digits),
         " high=",  DoubleToString(g_maxPrice, g_digits),
         " exit=",  DoubleToString(Bid, g_digits),
         "  pos=",  closed, " (seeds ", g_seedCount, ")",
         "  trail=", DoubleToString(g_trail, 2),
         "  price=", DoubleToString(priceProfit, 0),
         "  swap=",  DoubleToString(g_swapCycle, 0),
         "  total=", DoubleToString(cycleTotal, 0),
         "  cum=",   DoubleToString(g_totalPrice + g_totalSwap, 0));

   if(g_csv != INVALID_HANDLE)
      FileWrite(g_csv, g_cycle,
                TimeToString(g_cycleStart, TIME_DATE|TIME_MINUTES),
                TimeToString(TimeCurrent(), TIME_DATE|TIME_MINUTES),
                DoubleToString(g_ladderBase, g_digits),
                DoubleToString(g_maxPrice, g_digits),
                DoubleToString(g_minPrice, g_digits),
                DoubleToString(Bid, g_digits),
                closed, g_seedCount, g_peakPos,
                DoubleToString(g_trail, 2),
                DoubleToString(priceProfit, 0),
                DoubleToString(g_swapCycle, 0),
                DoubleToString(cycleTotal, 0),
                DoubleToString(g_totalPrice + g_totalSwap, 0));

   g_active = false;
   Refresh();
  }

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
double OpenPriceProfit()
  {
   double p = 0.0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))  continue;
      if(OrderMagicNumber() != MagicNumber)            continue;
      if(OrderSymbol() != Symbol())                    continue;
      if(OrderType() == OP_BUY)
         p += OrderProfit() + OrderCommission();
     }
   return(p);
  }

//+------------------------------------------------------------------+
void OpenCsv()
  {
   string name = StringConcatenate("Stapoji_", Symbol(), "_trail",
                                   DoubleToString(TrailMaxYen, 1), "_seed",
                                   DoubleToString(SeedStepYen, 1), "_",
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
   FileWrite(g_csv, "cycle", "start", "end", "base", "high", "low", "exit",
             "positions", "seeds", "peak_positions", "trail",
             "price_pl_jpy", "swap_jpy", "cycle_total_jpy", "cumulative_jpy");
   Print("CSV log: MQL4/Files/", name);
  }
//+------------------------------------------------------------------+
