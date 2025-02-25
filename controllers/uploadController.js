const { v4: uuidv4 } = require('uuid');
const Request = require('../models/request');
const { imageProcessingQueue } = require('../config/queue');
const csvtojson = require('csvtojson');

const uploadCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No CSV file provided' 
      });
    }

    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Empty CSV file provided' 
      });
    }

    const requestId = uuidv4();
    
    try {
      const csvData = req.file.buffer.toString();
      
      if (!csvData || csvData.trim() === '') {
        return res.status(400).json({ 
          success: false, 
          error: 'CSV file is empty' 
        });
      }
      
      if (!csvData.includes('S. No.') && !csvData.includes('Product Name')) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid CSV format: Required headers not found' 
        });
      }

      let jsonArray;
      try {
        jsonArray = await csvtojson({
          noheader: false,
          headers: ['S. No.', 'Product Name', 'Input Image Urls'],
          ignoreEmpty: true,
          trim: true
        }).fromString(csvData);
      } catch (csvParseError) {
        console.error('CSV parsing error:', csvParseError);
        return res.status(400).json({ 
          success: false, 
          error: 'Failed to parse CSV', 
          details: csvParseError.message 
        });
      }
      
      if (!jsonArray || jsonArray.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'No valid data found in CSV' 
        });
      }
      
      const products = [];
      
      for (const row of jsonArray) {
        try {
          if (!row['S. No.'] || !row['Product Name']) {
            console.warn('Skipping row with missing required fields:', row);
            continue;
          }
          
          const urls = [];
          
          if (row['Input Image Urls']) {
            urls.push(row['Input Image Urls'].trim());
          }
          
          Object.keys(row).forEach(key => {
            if (key.startsWith('field') && row[key]) {
              urls.push(row[key].trim());
            }
          });
          
          let serialNumber;
          try {
            serialNumber = parseInt(row['S. No.']);
            if (isNaN(serialNumber)) {
              console.warn(`Invalid serial number for row: ${row['S. No.']}, defaulting to 0`);
              serialNumber = 0;
            }
          } catch (parseError) {
            console.warn(`Error parsing serial number: ${parseError.message}, defaulting to 0`);
            serialNumber = 0;
          }
          
          const validUrls = urls.filter(url => {
            try {
              return url.length > 0 && (url.startsWith('http://') || url.startsWith('https://'));
            } catch (urlError) {
              console.warn(`Skipping invalid URL: ${url}`);
              return false;
            }
          });
          
          products.push({
            serialNumber,
            productName: row['Product Name'],
            inputUrls: validUrls
          });
        } catch (rowError) {
          console.error('Error processing row:', rowError, row);
        }
      }
      
      if (products.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'No valid products found in CSV' 
        });
      }

      try {
        const request = new Request({
          requestId,
          products,
          webhookUrl: req.body.webhookUrl || ''
        });
        
        await request.save();
      } catch (dbError) {
        console.error('Database error while saving request:', dbError);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to save request to database', 
          details: dbError.message 
        });
      }
      
      try {
        await imageProcessingQueue.add({ requestId }, { 
          attempts: 3,
          backoff: 5000
        });
      } catch (queueError) {
        console.error('Error adding job to queue:', queueError);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to queue processing task', 
          details: queueError.message 
        });
      }
      
      return res.status(200).json({
        success: true,
        requestId,
        message: 'CSV uploaded successfully and processing started',
        productsProcessed: products.length
      });
      
    } catch (processingError) {
      console.error('Error during CSV processing:', processingError);
      return res.status(500).json({ 
        success: false, 
        error: 'Error processing CSV file', 
        details: processingError.message 
      });
    }
    
  } catch (outerError) {
    console.error('Unexpected error in uploadCSV:', outerError);
    return res.status(500).json({ 
      success: false, 
      error: 'An unexpected error occurred', 
      details: outerError.message 
    });
  }
};

const safeUploadCSV = (req, res) => {
  uploadCSV(req, res).catch(error => {
    console.error('Unhandled error in uploadCSV:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error', 
        details: 'An unexpected error occurred during processing' 
      });
    }
  });
};

module.exports = { uploadCSV: safeUploadCSV };
