const Request = require('../models/request');
const { stringify } = require('csv-stringify/sync');

const getOutputData = async (req, res) => {
    try {
        const request = await Request.findOne({
            requestId: req.params.requestId,
        });

        if (!request) {
            return res.status(404).json({
                error: 'Request not found or not yet completed'
            });
        }

        if (request.status != "completed") {
            return res.status(404).json({
                error: 'Request is not completed or is failed'
            })
        }

        const csvData = request.products.map(product => ({
            'S. No.': product.serialNumber,
            'Product Name': product.productName,
            'Input Image Urls': product.inputUrls.join(', '),
            'Output Image Urls': product.outputUrls.join(', ')
        }));

        // Convert to CSV string
        const csv = stringify(csvData, {
            header: true,
            columns: ['S. No.', 'Product Name', 'Input Image Urls', 'Output Image Urls']
        });

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${request.requestId}.csv"`);

        // Send the CSV
        res.send(csv);

    } catch (error) {
        console.error('Error generating CSV:', error);
        res.status(500).json({
            error: 'Failed to generate CSV output'
        });
    }
};

module.exports = { getOutputData };
