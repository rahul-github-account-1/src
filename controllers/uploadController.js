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
      skip_empty_lines: true,
      trim: true,
      delimiter: ',',
      quote: '"',
      relax_column_count: true
    });
    
    parser.on('readable', function() {
      let record;
      while (record = parser.read()) {
        const columns = Object.keys(record);
        const productNameIndex = columns.indexOf('Product Name');
        const urlColumns = columns.slice(productNameIndex + 1);
        const urls = urlColumns.map(col => record[col]).filter(url => url);

        records.push({
          serialNumber: parseInt(record['S. No.']),
          productName: record['Product Name'],
          inputUrls: urls
        });
      }
    });

    parser.on('error', function(err) {
      console.error('CSV parsing error:', err);
      res.status(400).json({ error: 'Invalid CSV format' });
    });
    
    parser.on('end', async function() {
      try {
        const request = new Request({
          requestId,
          products: records,
          webhookUrl: req.body.webhookUrl
        });
        await request.save();
        
        await imageProcessingQueue.add({ requestId });
        
        res.json({ requestId });
      } catch (error) {
        console.error('Error saving request:', error);
        res.status(500).json({ error: 'Failed to process CSV' });
      }
    });
    
    parser.write(req.file.buffer.toString());
    parser.end();
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
};

module.exports = { uploadCSV };
