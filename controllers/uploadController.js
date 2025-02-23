const { parse } = require('csv-parse');
const { v4: uuidv4 } = require('uuid');
const Request = require('../models/request');
const { imageProcessingQueue } = require('../config/queue');

const uploadCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }

    const requestId = uuidv4();
    const records = [];
    
    const parser = parse({
      columns: true,
      skip_empty_lines: true
    });
    
    parser.on('readable', function() {
      let record;
      while (record = parser.read()) {
        records.push({
          serialNumber: parseInt(record['S. No.']),
          productName: record['Product Name'],
          inputUrls: record['Input Image Urls'].split(',').map(url => url.trim())
        });
      }
    });

    
    parser.on('end', async function() {
      const request = new Request({
        requestId,
        products: records,
        webhookUrl: req.body.webhookUrl
      });
      await request.save();
      
      await imageProcessingQueue.add({ requestId });
      
      res.json({ requestId });
    });
    
    parser.write(req.file.buffer.toString());
    parser.end();
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
};

module.exports = { uploadCSV };
