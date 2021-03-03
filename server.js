
// Dependencies
// =============================================================
	var express = require("express");
	var bodyParser = require("body-parser");
	var path = require('path');
	var axios = require('axios');

// =============================================================

// Database Setup
// =============================================================
	const MongoClient = require('mongodb').MongoClient;

	const uri = "mongodb+srv://patrickh:newave12@cluster0.aza0z.mongodb.net/RC_Mouse?retryWrites=true&w=majority";

	const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

	var db;

	client.connect(err => {
	  
	  db = client.db("RC_Mouse");
	  


	  // where does this go?
	  // client.close();
	});
// =============================================================

// Express App Setup and Index Path
// =============================================================
	var app = express();
	var PORT = 8080;

	// Sets up the Express app to handle data parsing
	app.use(bodyParser.json({limit: '50mb'}));
	app.use(bodyParser.text());
	app.use(bodyParser.urlencoded({limit: '50mb', extended: true, parameterLimit: 1000000}));

	app.use(express.static(__dirname + '/'));

	app.get('/', function(req, res){
		res.sendFile(path.join(__dirname + '/adminpanel.html'));
	});
// =============================================================

// Routes
// =============================================================
	app.get('/get-all-orders', async (req, res) => {

		db.collection('orders').find({}).toArray(function(err, result) {
			if (err) throw err;
			res.send(result);
		});

	});

	app.post('/processOrder', function(req, res){

		var currentOrder = req.body.currOrder;

		processOrder(currentOrder, res);

	});

	app.post('/generate-label', function(req, res){

		generateShippingLabel(req.body.currOrder, req.body.serCode, res);

	});

	app.post('/store-order-data', function(req, res){

		storeShippingInfo(req.body.currOrder, req.body.currLabel, res);

	});

	app.post('/change-order-status', function(req, res){

		changeOrderStatus(req.body.currOrder, req.body.currError, res);

	});

	app.post('/get-order-error', function(req, res){

		getOrderError(req.body.currOrder, res)

	});				

// Process New Order
// =============================================================

function processOrder(orderInfo, res){

	// Send a POST request
	axios({
		method: 'post',
		dataType: 'json',
		url: 'https://api.shipengine.com/v1/addresses/validate',
		data: [{
			"address_line1": orderInfo.Address1,
			"address_line2": orderInfo.Address2,
			"city_locality": orderInfo.City,
			"state_province": orderInfo.State,
			"postal_code": orderInfo.Zip,
			"country_code": "US"
		}],
		headers: {
			'API-Key': 'TEST_Ey0QyQ1OXgAuK/y67Fv3mSrg/jVVxgJSQ0SWTeRqxsY',
			'Content-Type': 'application/json'
		}
    })
    .then(function (response) {
        //handle success
        if(response.data[0].status == 'verified' && response.data[0].messages.length == 0){
        	console.log('address confirmed');
        	calculateShippingRate(orderInfo, res);
        } else {
        	res.send({status: 400, error: response.data[0].messages[0]});
        }
    })
    .catch(function (response) {
        //handle error

    });

};

// Calculate Shipping Rates
// =============================================================

	function calculateShippingRate(orderInfo, res){
							//USPS        UPS           FedEx
		//var carrierIds = ['se-530151', 'se-530152', 'se-530153']

		var shipTo = {
			"name": orderInfo.FirstName + ' '+ orderInfo.LastName,
			"phone": orderInfo.Phone,
			"address_line1": orderInfo.Address1,
			"address_line2": orderInfo.Address2,
			"city_locality": orderInfo.City,
			"state_province": orderInfo.State,
			"postal_code": orderInfo.Zip,
			"country_code": "US",
		};

		console.log('SHIP TO: ===========================')
		console.log(shipTo);

		console.log('sending request..');

		// Send a POST request
		axios({
			method: 'post',
			dataType: 'json',
			url: 'https://api.shipengine.com/v1/rates',
			data: { 
				"rate_options": {
					"carrier_ids": ['se-530151', 'se-530152', 'se-530153']
				},
				"shipment": {
					"validate_address": "no_validation",
					"ship_to": shipTo,
					"ship_from": {
						"company_name": "RC Mouse",
						"name": "Patrick Hernandez",
						"phone": "407-717-4398",
						"address_line1": "200 Bay Shore Dr",
						"address_line2": "Unit 115",
						"city_locality": "Moneta",
						"state_province": "VA",
						"postal_code": "24121",
						"country_code": "US",
					},
					"packages": [
					  {
					    "weight": {
					      "value": 5,
					      "unit": "ounce"
					    }
					  }
					]
				}
			},
			headers: {
				'API-Key': 'TEST_Ey0QyQ1OXgAuK/y67Fv3mSrg/jVVxgJSQ0SWTeRqxsY',
				'Content-Type': 'application/json'
			}
	    })
	    .then(function (response) {
	        //handle success

			response.data.rate_response.rates.sort(function(a, b) {
				return parseFloat(a.shipping_amount.amount) - parseFloat(b.shipping_amount.amount);
			});

			//way to specify this option better?
			var shippingOpts = []; 
	        for (var i = 0; i < 5; i++) {
	        	if(response.data.rate_response.rates[i].package_type == 'package' && response.data.rate_response.rates[i].service_type == 'USPS First Class Mail'){

	        		shippingOpts.push(response.data.rate_response.rates[i]);

	        	};
	        };

	        console.log('Rates Loaded')
	        console.log(shippingOpts);
	        generateShippingLabel(orderInfo, shippingOpts[0].rate_id, res)

	    })
	    .catch(function (response) {
	        //handle error
	        console.log(response);
	    });
	};
	
// Print Label
// =============================================================

	function generateShippingLabel(order, code, res){
		console.log(code);
		console.log(order);
		// Send a POST request
		axios({
			method: 'post',
			dataType: 'json',
			url: 'https://api.shipengine.com/v1/labels/rates/'+code,
			data: {
				"shipment": {
					// "service_code": code, //ups_ground
					"ship_to": {
						"name": order.FirstName + ' ' + order.LastName,
						"address_line1": order.Address1,
						"address_line2": order.Address2,
						"city_locality": order.City,
						"state_province": order.State,
						"postal_code": order.Zip,
						"country_code": "US",
						"address_residential_indicator": "yes"
					},
					"ship_from": {
						"name": "Patrick Hernandez",
						"company_name": "RC Mouse",
						"phone": "407-717-4398",
						"address_line1": "200 Bay Shore Dr",
						"address_line2": "Unit 115",
						"city_locality": "Moneta",
						"state_province": "VA",
						"postal_code": "24121",
						"country_code": "US",
						"address_residential_indicator": "yes"
					},
					"packages": [
						{
							"weight": {
								"value": 5,
					  			"unit": "ounce"
							}
						}
					]
				}
			},
			headers: {
				'API-Key': 'TEST_Ey0QyQ1OXgAuK/y67Fv3mSrg/jVVxgJSQ0SWTeRqxsY',
				'Content-Type': 'application/json'
			}
	    })
	    .then(function (response) {
	        //handle success
	        console.log(response);
	        res.send({status: 200, data: response.data});
	    })
	    .catch(function (response) {
	        //handle error
	        console.log(response.data);
	        console.log(response.response.data.errors);
	    });

	};

// Store Shipping Data & Send Email
// =============================================================

	function storeShippingInfo(order, labelData, res){

		db.collection('orders').updateOne({'OrderNum': order.OrderNum}, { $set: {'ShippingInfo': labelData, 'OrderStatus': 'Shipped'}}, function(err, result) {
			if (err) throw err;
			console.log('Order Updated!');

			//send email

			res.send({status: 'updated'});
		});

	};

// Change Order Status to Processed
// =============================================================

	function changeOrderStatus(order, error, res){

		db.collection('orders').updateOne({'OrderNum': order.OrderNum}, { $set: {'ErrorInfo': error, 'OrderStatus': 'Processed'}}, function(err, result) {
			if (err) throw err;
			res.send({status: 'updated'});
		});

	};

// Get Order Error
// =============================================================

	function getOrderError(order, res){

		db.collection('orders').find({'OrderNum': order.OrderNum}).toArray(function(err, result) {
			if (err) throw err;
			res.send(result);
		});

	};



// Starts the server
// =============================================================
	app.listen(process.env.PORT || 8080, function(){
		console.log("Express server running on port %d in %s mode", this.address().port, app.settings.env);

	});
// =============================================================