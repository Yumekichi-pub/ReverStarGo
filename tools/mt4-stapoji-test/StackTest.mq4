//+------------------------------------------------------------------+
//|                                                    StackTest.mq4 |
//|  Stacking limit probe for Rakuten MT4 (demo).                     |
//|                                                                   |
//|  Sends Buy Stop pending orders one after another and records      |
//|  how many succeed before the broker refuses.                      |
//|                                                                   |
//|  DEMO ACCOUNT ONLY. Comments are ASCII on purpose so that the     |
//|  file never turns into mojibake in MetaEditor.                    |
//+------------------------------------------------------------------+
#property copyright "ReverStarGo"
#property link      "https://reverstargo.com"
#property version   "1.00"
#property strict
#property script_show_inputs

//--- input parameters ----------------------------------------------
extern string  _s1              = "--- order size ---";
// Size is given in CURRENCY UNITS (not lots) to avoid a fat-finger
// mistake. 1,000 units = 0.01 lot, 100,000 units = 1.00 lot.
extern int     VolumeUnits      = 1000;      // order size in currency units
extern double  MaxLotsGuard     = 0.10;      // hard cap per order (safety)

extern string  _s2              = "--- price grid ---";
extern double  StartPrice       = 0.0;       // 0 = Ask + StartOffsetYen
extern double  StartOffsetYen   = 0.50;      // used only when StartPrice == 0
extern double  StepPips         = 20.0;      // gap between orders (min 0.1)

extern string  _s3              = "--- run control ---";
extern int     MaxOrders        = 500;       // how many orders to try
extern int     SleepMs          = 100;       // pause between OrderSend calls
extern int     StopAfterFails   = 20;        // consecutive failures -> stop (0 = never)
extern int     MagicNumber      = 20260831;  // tag, used by CleanUp.mq4
extern string  OrderComment     = "StackTest";
extern bool    WriteCsvLog      = true;      // dump result to MQL4/Files

//--- internals -----------------------------------------------------
#define  MAX_ERR_CODES 64

int      g_errCode[MAX_ERR_CODES];
int      g_errCount[MAX_ERR_CODES];
int      g_errFirstIndex[MAX_ERR_CODES];
int      g_errKinds = 0;

//+------------------------------------------------------------------+
int OnStart()
  {
   Print("==================================================");
   Print("StackTest start  ", TimeToString(TimeLocal(), TIME_DATE|TIME_SECONDS));

   //--- environment snapshot ---------------------------------------
   double point     = MarketInfo(Symbol(), MODE_POINT);
   int    digits    = (int)MarketInfo(Symbol(), MODE_DIGITS);
   double pipSize   = (digits == 3 || digits == 5) ? point * 10.0 : point;
   double stopLevel = MarketInfo(Symbol(), MODE_STOPLEVEL);
   double freezeLvl = MarketInfo(Symbol(), MODE_FREEZELEVEL);
   double minLot    = MarketInfo(Symbol(), MODE_MINLOT);
   double maxLot    = MarketInfo(Symbol(), MODE_MAXLOT);
   double lotStep   = MarketInfo(Symbol(), MODE_LOTSTEP);
   double ask       = MarketInfo(Symbol(), MODE_ASK);
   double bid       = MarketInfo(Symbol(), MODE_BID);

   Print("Symbol=", Symbol(), " digits=", digits, " point=", DoubleToString(point, 8),
         " pipSize=", DoubleToString(pipSize, 8));
   Print("Ask=", DoubleToString(ask, digits), " Bid=", DoubleToString(bid, digits),
         " spread=", DoubleToString((ask - bid) / pipSize, 2), "pips");
   Print("StopLevel=", DoubleToString(stopLevel, 1), "pt  FreezeLevel=",
         DoubleToString(freezeLvl, 1), "pt");
   Print("MinLot=", DoubleToString(minLot, 2), " MaxLot=", DoubleToString(maxLot, 2),
         " LotStep=", DoubleToString(lotStep, 2));
   Print("Account: balance=", DoubleToString(AccountBalance(), 2),
         " freeMargin=", DoubleToString(AccountFreeMargin(), 2),
         " leverage=1:", AccountLeverage(),
         " server=", AccountServer(), " demo=", (IsDemo() ? "yes" : "no"));
   Print("Existing orders in terminal: ", OrdersTotal());

   //--- guards ------------------------------------------------------
   if(!IsTradeAllowed())
     {
      Print("ABORT: trading is not allowed. Turn on AutoTrading "
            "(Tools > Options > Expert Advisors > Allow automated trading).");
      return(1);
     }
   if(!IsDemo())
      Print("WARNING: this is NOT a demo account. Real orders will be sent.");

   //--- volume: currency units -> lots ------------------------------
   // MT4 lot for FX majors = 100,000 units, so lots = units / 100,000.
   // (The plan mentioned "divide by 100"; that would turn 1,000 units
   //  into 10.00 lots = 1,000,000 units, so /100000 is used here.)
   double lots = VolumeUnits / 100000.0;
   lots = NormalizeDouble(MathFloor(lots / lotStep + 0.5) * lotStep, 2);

   if(lots < minLot)
     {
      Print("ABORT: VolumeUnits=", VolumeUnits, " -> ", DoubleToString(lots, 2),
            " lot is below MinLot=", DoubleToString(minLot, 2));
      return(1);
     }
   if(lots > MaxLotsGuard)
     {
      Print("ABORT: ", DoubleToString(lots, 2), " lot exceeds MaxLotsGuard=",
            DoubleToString(MaxLotsGuard, 2), ". Raise the guard only on purpose.");
      return(1);
     }
   if(lots > maxLot)
     {
      Print("ABORT: ", DoubleToString(lots, 2), " lot exceeds broker MaxLot=",
            DoubleToString(maxLot, 2));
      return(1);
     }

   if(StepPips < 0.1)
     {
      Print("ABORT: StepPips must be >= 0.1");
      return(1);
     }
   if(MaxOrders < 1)
     {
      Print("ABORT: MaxOrders must be >= 1");
      return(1);
     }

   //--- price grid --------------------------------------------------
   double step  = StepPips * pipSize;
   double start = (StartPrice > 0.0) ? StartPrice : ask + StartOffsetYen;
   start = NormalizeDouble(start, digits);

   double minAllowed = ask + stopLevel * point;
   if(start <= minAllowed)
     {
      Print("NOTE: StartPrice ", DoubleToString(start, digits),
            " is inside the stop level; shifting up to ",
            DoubleToString(minAllowed + step, digits));
      start = NormalizeDouble(minAllowed + step, digits);
     }

   Print("Plan: ", MaxOrders, " Buy Stop x ", DoubleToString(lots, 2), " lot (",
         VolumeUnits, " units), from ", DoubleToString(start, digits),
         " step ", DoubleToString(StepPips, 1), "pips (",
         DoubleToString(step, digits), "), last price ",
         DoubleToString(start + step * (MaxOrders - 1), digits));
   Print("--------------------------------------------------");

   //--- the loop ----------------------------------------------------
   uint   t0            = GetTickCount();
   int    okCount       = 0;
   int    ngCount       = 0;
   int    firstFailAt   = -1;
   int    firstFailCode = 0;
   int    consecFails   = 0;
   int    attempted     = 0;
   int    lastTicket    = 0;
   double lastOkPrice   = 0.0;
   string stopReason    = "reached MaxOrders";

   for(int i = 0; i < MaxOrders; i++)
     {
      if(IsStopped())
        {
         stopReason = "stopped by user / terminal";
         break;
        }

      double price = NormalizeDouble(start + step * i, digits);
      attempted++;

      ResetLastError();
      uint tOrder = GetTickCount();
      int ticket = OrderSend(Symbol(), OP_BUYSTOP, lots, price, 0, 0, 0,
                             OrderComment, MagicNumber, 0, clrDodgerBlue);
      uint dtOrder = GetTickCount() - tOrder;

      if(ticket > 0)
        {
         okCount++;
         consecFails = 0;
         lastTicket  = ticket;
         lastOkPrice = price;
         if(okCount <= 5 || okCount % 25 == 0)
            Print("#", (i + 1), " OK   ticket=", ticket,
                  " price=", DoubleToString(price, digits),
                  " (", dtOrder, "ms)");
        }
      else
        {
         int err = GetLastError();
         ngCount++;
         consecFails++;
         RecordError(err, i + 1);
         if(firstFailAt < 0)
           {
            firstFailAt   = i + 1;
            firstFailCode = err;
            Print(">>> FIRST FAILURE at order #", (i + 1),
                  " price=", DoubleToString(price, digits));
           }
         Print("#", (i + 1), " NG   err=", err, " (", ErrorText(err), ")",
               " price=", DoubleToString(price, digits), " (", dtOrder, "ms)");

         if(StopAfterFails > 0 && consecFails >= StopAfterFails)
           {
            stopReason = StringConcatenate(consecFails, " consecutive failures");
            break;
           }
        }

      if(SleepMs > 0)
         Sleep(SleepMs);
     }

   uint   elapsed = GetTickCount() - t0;
   double secs    = elapsed / 1000.0;

   //--- summary -----------------------------------------------------
   Print("==================================================");
   Print("StackTest RESULT  (", Symbol(), ")");
   Print("  attempted        : ", attempted, " / ", MaxOrders);
   Print("  succeeded        : ", okCount);
   Print("  failed           : ", ngCount);
   if(firstFailAt > 0)
      Print("  first failure at : #", firstFailAt, "  err=", firstFailCode,
            " (", ErrorText(firstFailCode), ")");
   else
      Print("  first failure at : none - no wall hit within ", MaxOrders, " orders");
   Print("  last OK ticket   : ", lastTicket, " @ ", DoubleToString(lastOkPrice, digits));
   Print("  stop reason      : ", stopReason);
   Print("  elapsed          : ", DoubleToString(secs, 3), " s");
   if(okCount > 0)
      Print("  avg per success  : ", DoubleToString(elapsed / (double)okCount, 1), " ms");
   Print("  orders in terminal now: ", OrdersTotal());
   Print("  free margin now  : ", DoubleToString(AccountFreeMargin(), 2));

   if(g_errKinds > 0)
     {
      Print("  --- error breakdown ---");
      for(int e = 0; e < g_errKinds; e++)
         Print("    err ", g_errCode[e], " x", g_errCount[e],
               "  first at #", g_errFirstIndex[e], "  : ", ErrorText(g_errCode[e]));
     }
   Print("==================================================");

   if(WriteCsvLog)
      WriteLog(okCount, ngCount, attempted, firstFailAt, firstFailCode,
               secs, lots, start, step, digits, stopReason);

   //--- on-screen summary -------------------------------------------
   string msg = StringConcatenate(
                   "StackTest done\n",
                   "OK ", okCount, " / tried ", attempted, "\n",
                   (firstFailAt > 0
                    ? StringConcatenate("first failure #", firstFailAt,
                                        " err ", firstFailCode, " ", ErrorText(firstFailCode))
                    : "no failure"), "\n",
                   "elapsed ", DoubleToString(secs, 2), " s\n",
                   "(details in the Experts tab)");
   Comment(msg);
   Print(msg);

   return(0);
  }

//+------------------------------------------------------------------+
//| Keep a per-code tally of failures.                               |
//+------------------------------------------------------------------+
void RecordError(int code, int index)
  {
   for(int i = 0; i < g_errKinds; i++)
      if(g_errCode[i] == code)
        {
         g_errCount[i]++;
         return;
        }
   if(g_errKinds >= MAX_ERR_CODES)
      return;
   g_errCode[g_errKinds]       = code;
   g_errCount[g_errKinds]      = 1;
   g_errFirstIndex[g_errKinds] = index;
   g_errKinds++;
  }

//+------------------------------------------------------------------+
//| CSV dump into <data folder>/MQL4/Files/                          |
//+------------------------------------------------------------------+
void WriteLog(int okCount, int ngCount, int attempted, int firstFailAt,
              int firstFailCode, double secs, double lots, double start,
              double step, int digits, string stopReason)
  {
   string name = StringConcatenate("StackTest_", Symbol(), "_",
                                   TimeToString(TimeLocal(), TIME_DATE), "_",
                                   GetTickCount());
   StringReplace(name, ".", "");
   StringReplace(name, ":", "");
   StringReplace(name, " ", "_");
   name = name + ".csv";

   int h = FileOpen(name, FILE_WRITE | FILE_CSV | FILE_ANSI, ',');
   if(h == INVALID_HANDLE)
     {
      Print("CSV log skipped, FileOpen failed err=", GetLastError());
      return;
     }
   FileWrite(h, "key", "value");
   FileWrite(h, "time",        TimeToString(TimeLocal(), TIME_DATE | TIME_SECONDS));
   FileWrite(h, "server",      AccountServer());
   FileWrite(h, "symbol",      Symbol());
   FileWrite(h, "lots",        DoubleToString(lots, 2));
   FileWrite(h, "units",       VolumeUnits);
   FileWrite(h, "start_price", DoubleToString(start, digits));
   FileWrite(h, "step_pips",   DoubleToString(StepPips, 2));
   FileWrite(h, "max_orders",  MaxOrders);
   FileWrite(h, "attempted",   attempted);
   FileWrite(h, "succeeded",   okCount);
   FileWrite(h, "failed",      ngCount);
   FileWrite(h, "first_fail_at",   firstFailAt);
   FileWrite(h, "first_fail_code", firstFailCode);
   FileWrite(h, "first_fail_text", ErrorText(firstFailCode));
   FileWrite(h, "stop_reason", stopReason);
   FileWrite(h, "elapsed_sec", DoubleToString(secs, 3));
   FileWrite(h, "orders_now",  OrdersTotal());
   FileWrite(h, "free_margin", DoubleToString(AccountFreeMargin(), 2));
   FileWrite(h, "");
   FileWrite(h, "err_code", "count", "first_index", "meaning");
   for(int e = 0; e < g_errKinds; e++)
      FileWrite(h, g_errCode[e], g_errCount[e], g_errFirstIndex[e], ErrorText(g_errCode[e]));
   FileClose(h);
   Print("CSV log written: MQL4/Files/", name);
  }

//+------------------------------------------------------------------+
//| Human readable text for the trade server error codes that matter |
//| for a stacking test.                                             |
//+------------------------------------------------------------------+
string ErrorText(int code)
  {
   switch(code)
     {
      case 0:    return("no error");
      case 1:    return("no result / nothing changed");
      case 2:    return("common error - server side refusal");
      case 3:    return("invalid trade parameters");
      case 4:    return("trade server is busy");
      case 5:    return("old terminal version");
      case 6:    return("no connection to the trade server");
      case 8:    return("too frequent requests - slow down (raise SleepMs)");
      case 64:   return("account disabled");
      case 65:   return("invalid account");
      case 128:  return("trade timeout");
      case 129:  return("invalid price");
      case 130:  return("invalid stops - price too close to market / stop level");
      case 131:  return("invalid trade volume (lot size)");
      case 132:  return("market is closed");
      case 133:  return("trade is disabled on this account");
      case 134:  return("not enough money (margin wall)");
      case 135:  return("price changed - retry");
      case 136:  return("off quotes - no price from the server");
      case 137:  return("broker is busy");
      case 138:  return("requote");
      case 139:  return("order is locked / being processed");
      case 140:  return("long positions only allowed");
      case 141:  return("too many requests");
      case 145:  return("modification denied, order too close to market");
      case 146:  return("trade context is busy");
      case 147:  return("expiration denied by broker");
      case 148:  return("TOO MANY ORDERS - broker cap on open+pending orders");
      case 149:  return("hedging is prohibited");
      case 150:  return("prohibited by FIFO rule");
      case 4051: return("invalid function parameter value");
      case 4106: return("unknown symbol");
      case 4107: return("invalid price parameter");
      case 4109: return("trading is not allowed - enable AutoTrading");
      case 4110: return("long positions are not allowed");
      case 4111: return("short positions are not allowed");
      case 4200: return("object already exists");
      default:   break;
     }
   return(StringConcatenate("undocumented here, see MQL4 error list (", code, ")"));
  }
//+------------------------------------------------------------------+
