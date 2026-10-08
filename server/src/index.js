const app = require('./app');
const config = require('./config');
const { lifecycleTick } = require('./util');

app.listen(config.port, () => {
  console.log(`[fitness-app] server listening on http://localhost:${config.port}`);
  lifecycleTick(true).catch(e => console.error('lifecycle tick failed:', e.message));
  setInterval(() => lifecycleTick(true).catch(() => {}), 10 * 60 * 1000);
});
