//+------------------------------------------------------------------+
//|                                                      CleanUp.mq4 |
//|  Deletes pending orders left behind by StackTest.mq4.             |
//|                                                                   |
//|  Default settings delete ONLY pending orders (never a position)   |
//|  on the current chart symbol. Widen the filters on purpose.       |
//|                                                                   |
//|  DEMO ACCOUNT ONLY. ASCII comments on purpose (mojibake safe).    |
//+------------------------------------------------------------------+
#property copyright "ReverStarGo"
#property link      "https://reverstargo.com"
#property version   "1.00"
#property strict
#property script_show_inputs

extern string _s1            = "--- filters ---";
extern bool   OnlyThisSymbol = true;       // limit to the chart symbol
extern int    MagicNumber    = 20260831;   // -1 = any magic number
extern string _s2            = "--- behaviour ---";
extern int    MaxPasses      = 20;         // retry passes over the order pool
extern int    SleepMs        = 50;         // pause between deletes
extern int    RetryPerOrder  = 3;          // retries for a single order

//+------------------------------------------------------------------+
int OnStart()
  {
   Print("==================================================");
   Print("CleanUp start  ", TimeToString(TimeLocal(), TIME_DATE|TIME_SECONDS),
         "  orders in terminal: ", OrdersTotal());
   Print("Filters: symbol=", (OnlyThisSymbol ? Symbol() : "ANY"),
         "  magic=", (MagicNumber < 0 ? "ANY" : (string)MagicNumber));

   if(!IsTradeAllowed())
     {
      Print("ABORT: trading is not allowed. Turn on AutoTrading "
            "(Tools > Options > Expert Advisors > Allow automated trading).");
      return(1);
     }

   uint t0        = GetTickCount();
   int  deleted   = 0;
   int  failed    = 0;
   int  skipped   = 0;
   int  pass      = 0;

   while(pass < MaxPasses)
     {
      pass++;
      int deletedThisPass = 0;
      skipped = 0;

      // Walk backwards: the pool re-indexes as orders disappear.
      for(int i = OrdersTotal() - 1; i >= 0; i--)
        {
         if(IsStopped())
           {
            Print("Stopped by user / terminal.");
            pass = MaxPasses;
            break;
           }
         if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
            continue;

         int type = OrderType();
         if(type == OP_BUY || type == OP_SELL)       // never touch positions
            continue;
         if(OnlyThisSymbol && OrderSymbol() != Symbol())
           { skipped++; continue; }
         if(MagicNumber >= 0 && OrderMagicNumber() != MagicNumber)
           { skipped++; continue; }

         int ticket = OrderTicket();
         bool ok    = false;
         for(int r = 0; r < RetryPerOrder && !ok; r++)
           {
            ResetLastError();
            ok = OrderDelete(ticket, clrOrangeRed);
            if(!ok)
              {
               int err = GetLastError();
               Print("  delete failed ticket=", ticket, " err=", err,
                     " (", ErrorText(err), ") retry ", (r + 1), "/", RetryPerOrder);
               Sleep(200);
              }
           }

         if(ok)
           {
            deleted++;
            deletedThisPass++;
            if(deleted % 50 == 0)
               Print("  deleted ", deleted, " ...");
           }
         else
            failed++;

         if(SleepMs > 0)
            Sleep(SleepMs);
        }

      if(deletedThisPass == 0)
         break;   // nothing left that matches the filter
     }

   double secs = (GetTickCount() - t0) / 1000.0;
   Print("--------------------------------------------------");
   Print("CleanUp RESULT");
   Print("  deleted            : ", deleted);
   Print("  failed             : ", failed);
   Print("  skipped by filter  : ", skipped);
   Print("  passes used        : ", pass);
   Print("  elapsed            : ", DoubleToString(secs, 3), " s");
   Print("  orders remaining   : ", OrdersTotal());
   Print("==================================================");

   string msg = StringConcatenate("CleanUp done\ndeleted ", deleted,
                                  "  failed ", failed,
                                  "\nremaining in terminal ", OrdersTotal());
   Comment(msg);
   Print(msg);
   return(0);
  }

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
      case 6:    return("no connection to the trade server");
      case 8:    return("too frequent requests - slow down (raise SleepMs)");
      case 128:  return("trade timeout");
      case 132:  return("market is closed");
      case 133:  return("trade is disabled on this account");
      case 139:  return("order is locked / being processed");
      case 141:  return("too many requests");
      case 145:  return("modification denied, order too close to market");
      case 146:  return("trade context is busy");
      case 4051: return("invalid function parameter value");
      case 4108: return("invalid ticket - order already gone");
      case 4109: return("trading is not allowed - enable AutoTrading");
      default:   break;
     }
   return(StringConcatenate("undocumented here, see MQL4 error list (", code, ")"));
  }
//+------------------------------------------------------------------+
