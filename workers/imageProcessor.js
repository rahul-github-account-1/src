require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { imageProcessingQueue } = require('../config/queue');
const sharp = require('sharp');
const axios = require('axios');
const { s3 } = require('../config/aws');
const Request = require('../models/request');
const connectDB = require('../config/database');
const requiredEnvVars = ['MONGODB_URI', 'REDIS_HOST', 'REDIS_PORT'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

const mongoose = require('mongoose');
mongoose.set('strictQuery', false);

connectDB();

console.log('Worker process started');
imageProcessingQueue.process(async (job) => {
  const { requestId } = job.data;

  try {
    console.log(`Processing request: ${requestId}`);
    const request = await Request.findOne({ requestId });

    if (!request) {
      throw new Error('Request not found');
    }

    request.status = 'processing';
    await request.save();

    for (const product of request.products) {
      try {
        product.status = 'processing';
        await request.save();

        const outputUrls = [];
        let processedCount = 0;
        let hasErrors = false;

        for (const inputUrl of product.inputUrls) {
          try {
            console.log(`Processing image: ${inputUrl}`);
            const response = await axios.get(inputUrl, {
              responseType: 'arraybuffer',
              timeout: 10000, 
              retry: 3, 
              retryDelay: 1000 
            });

            if (response.status !== 200) {
              throw new Error(`Failed to download image: ${response.status}`);
            }

            const buffer = Buffer.from(response.data);


            const processedBuffer = await sharp(buffer)
              .jpeg({ quality: 50 })
              .toBuffer();

            const key = `processed/${requestId}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
            const uploadResult = await s3.upload({
              Bucket: process.env.S3_BUCKET,
              Key: key,
              Body: processedBuffer,
              ContentType: 'image/jpeg'
            }).promise();

            outputUrls.push(uploadResult.Location);
            processedCount++;

            await job.progress((processedCount / product.inputUrls.length) * 100);

          } catch (error) {
            console.error(`Error processing image ${inputUrl}:`, error);
            hasErrors = true;
            outputUrls.push(null); 
            product.status = 'failed';
            await request.save();
          }
        }

        product.outputUrls = outputUrls;
        product.status = hasErrors ? 'failed' : 'completed';
        await request.save();

      } catch (error) {
        console.error(`Error processing product ${product.productName}:`, error);
        product.status = 'failed';
        await request.save();
      }
    }

    const hasFailedProducts = request.products.some(p => p.status === 'failed');
    request.status = hasFailedProducts ? 'failed' : 'completed';
    await request.save();

    if (request.webhookUrl) {
      try {
        await axios.post(request.webhookUrl, {
          requestId: request.requestId,
          status: request.status,
          products: request.products,
          error: hasFailedProducts ? 'Some products failed processing' : null
        });
      } catch (error) {
        console.error('Webhook notification failed:', error);
      }
    }

    if (hasFailedProducts) {
      throw new Error('Some products failed processing');
    }

    return { success: true };

  } catch (error) {
    console.error(`Request ${requestId} processing failed:`, error);
    const request = await Request.findOne({ requestId });
    if (request) {
      request.status = 'failed';
      await request.save();
    }
    throw error;
  }
});

imageProcessingQueue.on('failed', async (job, error) => {
  console.error(`Job ${job.id} failed:`, error);

  try {
    const request = await Request.findOne({ requestId: job.data.requestId });
    if (request) {
      request.status = 'failed';
      await request.save();
    }
  } catch (dbError) {
    console.error('Failed to update request status in database:', dbError);
  }
});

imageProcessingQueue.on('retrying', (job, error) => {
  console.log(`Retrying job ${job.id} after failed attempt:`, error);
});