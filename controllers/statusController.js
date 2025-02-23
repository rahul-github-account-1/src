const Request = require('../models/request');

const getStatus = async (req, res) => {
  try {
    const request = await Request.findOne({ requestId: req.params.requestId });
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    res.json({
      requestId: request.requestId,
      status: request.status,
      products: request.products.map(p => ({
        serialNumber: p.serialNumber,
        productName: p.productName,
        status: p.status,
        inputUrls: p.inputUrls,
        outputUrls: p.outputUrls,
        progress: p.outputUrls.length / p.inputUrls.length * 100
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Status check failed' });
  }
};

module.exports = { getStatus };
