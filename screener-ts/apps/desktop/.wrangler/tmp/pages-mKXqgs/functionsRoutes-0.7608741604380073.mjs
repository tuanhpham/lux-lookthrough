import { onRequestGet as __api_finnhub___path___ts_onRequestGet } from "/Users/huongnguyen105/Documents/Github/lux-lookthrough/screener-ts/apps/desktop/functions/api/finnhub/[[path]].ts"
import { onRequestGet as __api_nasdaqtrader___path___ts_onRequestGet } from "/Users/huongnguyen105/Documents/Github/lux-lookthrough/screener-ts/apps/desktop/functions/api/nasdaqtrader/[[path]].ts"
import { onRequestGet as __api_wiki___path___ts_onRequestGet } from "/Users/huongnguyen105/Documents/Github/lux-lookthrough/screener-ts/apps/desktop/functions/api/wiki/[[path]].ts"
import { onRequestGet as __api_yahoo___path___ts_onRequestGet } from "/Users/huongnguyen105/Documents/Github/lux-lookthrough/screener-ts/apps/desktop/functions/api/yahoo/[[path]].ts"

export const routes = [
    {
      routePath: "/api/finnhub/:path*",
      mountPath: "/api/finnhub",
      method: "GET",
      middlewares: [],
      modules: [__api_finnhub___path___ts_onRequestGet],
    },
  {
      routePath: "/api/nasdaqtrader/:path*",
      mountPath: "/api/nasdaqtrader",
      method: "GET",
      middlewares: [],
      modules: [__api_nasdaqtrader___path___ts_onRequestGet],
    },
  {
      routePath: "/api/wiki/:path*",
      mountPath: "/api/wiki",
      method: "GET",
      middlewares: [],
      modules: [__api_wiki___path___ts_onRequestGet],
    },
  {
      routePath: "/api/yahoo/:path*",
      mountPath: "/api/yahoo",
      method: "GET",
      middlewares: [],
      modules: [__api_yahoo___path___ts_onRequestGet],
    },
  ]