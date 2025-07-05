import { PositionLogger } from "./dist";

const l = new PositionLogger();
l.start({ interval: 0.01, maxHistorySize: 100000 });

// print position history count
setInterval(() => {
  const count = l.getHistoryCount();
  console.log(`Position history count: ${count}`);
}, 1000);
