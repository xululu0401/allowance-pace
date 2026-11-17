# 生活费的给法（allowance-pace）

同样一个月的生活费，按月、按半月、按周还是按天给？按「先付必须的，再按 冲动 × 富余 ÷ 到下次到账还剩几天 随手花」的规则逐天推一遍，看四种给法哪天开始缺钱、缺多少、要单独留多少备用金。

- 体验：https://xululu0401.github.io/allowance-pace/
- 纯前端，`index.html` + `core.js` + `ui.js`，不联网，设定存在浏览器本机。
- 测试：`node --test tests/core.test.cjs`；独立参考实现 `python3 tests/ref.py` 生成 `tests/ref.json`（300 组 × 4 种给法）；注入测试 `node tests/inject.cjs`。
- 「花得多快」是模型假设，不是测量值；默认金额与开销为虚构示例。
