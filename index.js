"use strict";

const i2cBus = require('i2c-bus');
const gpio = require('./gpio');
const net = require('net');

const ADDRESS = 0x04;
const HAS_NEW_DATA_PIN = 37;
const KNOBS_COUNT = 12;

const PD_PORT = 13000;
const PD_HOST = '127.0.0.1';

const i2c = i2cBus.openSync(1);

function sendToPd(buffer) {

	let message = "";
	for(let i = 2; i < buffer.length; i++) {
		message += "knob" + (i-1) + " " +buffer.readUInt8(i) + ";";
	}

	var client = new net.Socket();
  client.connect(PD_PORT, PD_HOST, function() {
  	console.log('Connected');
  	client.write(message);
    console.log('sent: ' + message);
		client.destroy(); // kill client after send
  });

  client.on('data', function(data) {
  	console.log('Received: ' + data);
  });

  client.on('close', function() {
  	console.log('Connection closed');
  });

	//buf.readUInt8(0)

	// let message = new Buffer('My KungFu is Good!');
	// let client = dgram.createSocket('udp4');
	// client.send(message, 0, message.length, PD_PORT, PD_HOST, function(err, bytes) {
	//     if (err) throw err;
	//     console.log('UDP message sent to ' + PD_HOST +':'+ PD_PORT);
	//     client.close();
	// });
}

function readDataFromArduino() {
	let writeBuffer = new Buffer([100]);
	let write = i2c.i2cWriteSync(ADDRESS, 1, writeBuffer)
	//console.log('writeen ' + write + ' bytes', writeBuffer);

	let buffer = new Buffer(KNOBS_COUNT + 2);
	let read = i2c.i2cReadSync(ADDRESS, KNOBS_COUNT + 2, buffer);
	console.log('read ' + read + ' bytes', buffer);

	sendToPd(buffer);
}

gpio.watch(HAS_NEW_DATA_PIN, gpio.EDGE_RISING, function(value) {
	console.log('value is now ' + value);

	if (value) {
		readDataFromArduino();
	}
});

readDataFromArduino();
