require('dotenv').config();
const express = require('express');
const connectDB = require('./config/database');
const routes = require('./routes');
const { bullBoardAdapter } = require('./config/queue');

const app = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.use(express.json());
app.use('/api', routes);
app.use('/admin/queues', bullBoardAdapter.getRouter());

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Bull Board available at http://localhost:${PORT}/admin/queues`);
});