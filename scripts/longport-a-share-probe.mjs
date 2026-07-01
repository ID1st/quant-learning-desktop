import { Config, QuoteContext, SubType } from "longbridge";

const DEFAULT_HTTP_URL = "https://openapi.longbridge.com";
const DEFAULT_SYMBOLS = ["600519.SH", "000001.SZ"];
const DEFAULT_PUSH_WAIT_MS = 15000;

function getCredential(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }

  return value;
}

function getSymbols() {
  const rawSymbols = process.argv.slice(2).flatMap((argument) => argument.split(","));
  const symbols = rawSymbols.map((symbol) => symbol.trim()).filter(Boolean);
  return symbols.length > 0 ? symbols : DEFAULT_SYMBOLS;
}

function toNumber(value) {
  const numericValue = Number(value?.toString?.() ?? value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatAge(timestamp) {
  const ageMs = Date.now() - timestamp.getTime();
  const ageSeconds = Math.round(ageMs / 1000);
  const label = ageMs < 0 ? "未来时间" : `${ageSeconds} 秒前`;

  return {
    ageMs,
    label,
  };
}

function classifyRealtime(timestamp) {
  const { ageMs } = formatAge(timestamp);

  if (ageMs < 0) {
    return "时间异常";
  }

  if (ageMs <= 60_000) {
    return "接近实时";
  }

  if (ageMs <= 15 * 60_000) {
    return "可能为延迟行情或低频更新";
  }

  return "明显非实时，可能休市、无实时权限或返回上一交易时段数据";
}

function createConfig() {
  const appKey = getCredential("LONGBRIDGE_APP_KEY");
  const appSecret = getCredential("LONGBRIDGE_APP_SECRET");
  const accessToken = getCredential("LONGBRIDGE_ACCESS_TOKEN");
  const httpUrl = process.env.LONGBRIDGE_HTTP_URL?.trim() || DEFAULT_HTTP_URL;

  return Config.fromApikey(appKey, appSecret, accessToken, {
    httpUrl,
    language: 0,
  });
}

function printSnapshotResult(quotes) {
  if (quotes.length === 0) {
    console.log("快照接口没有返回任何证券数据。");
    return;
  }

  for (const quote of quotes) {
    const timestamp = quote.timestamp;
    const age = formatAge(timestamp);
    const lastDone = toNumber(quote.lastDone);
    const previousClose = toNumber(quote.prevClose);
    const changePercent = previousClose === 0 ? 0 : ((lastDone - previousClose) / previousClose) * 100;

    console.log(
      [
        `${quote.symbol}`,
        `最新价=${lastDone}`,
        `昨收=${previousClose}`,
        `涨跌幅=${changePercent.toFixed(2)}%`,
        `成交量=${quote.volume}`,
        `行情时间=${timestamp.toISOString()}`,
        `距离当前=${age.label}`,
        `判断=${classifyRealtime(timestamp)}`,
      ].join(" | "),
    );
  }
}

async function probePushQuote(quoteContext, symbols) {
  const waitMs = Number(process.env.LONGBRIDGE_A_SHARE_PUSH_WAIT_MS ?? DEFAULT_PUSH_WAIT_MS);

  console.log(`开始订阅 A 股 Quote 推送，等待 ${waitMs}ms：${symbols.join(", ")}`);

  return new Promise((resolve) => {
    let resolved = false;
    const events = [];
    const timeout = setTimeout(async () => {
      if (resolved) {
        return;
      }

      resolved = true;
      await quoteContext.unsubscribe(symbols, [SubType.Quote]).catch(() => undefined);
      resolve(events);
    }, waitMs);

    quoteContext.setOnQuote((_error, event) => {
      if (resolved) {
        return;
      }

      events.push(event);
      console.log(`收到推送事件：${event.toString()}`);

      if (events.length >= symbols.length) {
        resolved = true;
        clearTimeout(timeout);
        quoteContext.unsubscribe(symbols, [SubType.Quote]).finally(() => resolve(events));
      }
    });

    quoteContext.subscribe(symbols, [SubType.Quote]).catch((error) => {
      if (resolved) {
        return;
      }

      resolved = true;
      clearTimeout(timeout);
      console.log(`推送订阅失败：${error instanceof Error ? error.message : String(error)}`);
      resolve(events);
    });
  });
}

async function main() {
  const symbols = getSymbols();
  const config = createConfig();
  const quoteContext = await QuoteContext.new(config);

  console.log(`测试标的：${symbols.join(", ")}`);
  console.log(`本机时间：${new Date().toISOString()}`);
  console.log("开始拉取 A 股实时快照...");

  const quotes = await quoteContext.quote(symbols);
  printSnapshotResult(quotes);

  const pushEvents = await probePushQuote(quoteContext, symbols);
  if (pushEvents.length === 0) {
    console.log("订阅窗口内没有收到推送；若当前非交易时段，这不一定代表订阅失败。");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
