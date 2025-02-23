const Bull = require('bull');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const imageProcessingQueue = new Bull('image-processing', {
    redis: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT)
    },
    defaultJobOptions: {
      attempts: 3, 
      backoff: {
        type: 'exponential',
        delay: 2000 
      },
      removeOnComplete: false, 
      removeOnFail: false
    }
  });

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullAdapter(imageProcessingQueue)],
  serverAdapter
});

module.exports = {
  imageProcessingQueue,
  bullBoardAdapter: serverAdapter
};

