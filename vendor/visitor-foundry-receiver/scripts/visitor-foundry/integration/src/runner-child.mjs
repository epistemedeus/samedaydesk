import { evaluate } from './recipe.mjs';
let received = false;
process.on('message', message => {
  if (received || message.type !== 'execute') return;
  received = true;
  try {
    const result = evaluate(message.input, new Date().toISOString());
    process.send({ type: 'result', result }, () => {
      if (!message.withholdExit) process.exit(0);
    });
  } catch { process.exit(2); }
});
// Owned bounded fixture has no descendant processes or contributed commands.
// Parent loss is NOT treated as proof of termination by the durable store.
process.on('disconnect', () => process.exit(3));
