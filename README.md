# 黄金市场智能仪表盘 V1.0

这是中文化 cTrader Web Plugin。采用官方当前 build-less 单文件 SDK 架构：HTML/CSS/JavaScript + esm.sh + cTrader Plugin SDK。

## cTrader Web Plugin Builder 填写
- Name：黄金市场智能仪表盘
- Description：中文化 XAUUSD 市场智能分析：多周期状态、结构、波动率、交易时段、新闻与交易复盘。
- Website URL：https://你的用户名.github.io/你的仓库名/
- Icon：使用现有 300×300 图标
- Mobile Trade bottom sheet：ON，60%
- Mobile Symbol Overview bottom sheet：OFF
- Mobile Symbol Overview embedded：OFF
- Web/Windows/macOS Active Symbol Panel Block：ON，Title=市场智能，Size=M
- Active Symbol Panel Tab：ON，Title=市场智能
- Trade Watch Tab：ON，Title=市场智能
- Separate Window：ON，Title=黄金市场智能仪表盘，Size=M
- Quick Access：ON
- Bottom panel：ON
- Top panel：OFF
- Compliance：按真实情况全部确认

## GitHub Pages
将 index.html 放在仓库根目录；Settings > Pages > Deploy from branch > main > /(root)。然后把生成的 Pages 根地址填入 Builder 的 Website URL。

## 说明
cTrader Plugin SDK 当前没有原生经济日历接口，因此 V1.0 新闻区明确显示“数据源未接入”，不伪造实时新闻。后续若接外部新闻源，需考虑 cTrader Web Plugin 的域名限制与 Store 规则。
