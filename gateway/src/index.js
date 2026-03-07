require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[gateway] Ghost-Cart Orchestrator running on port ${PORT}`);
});
