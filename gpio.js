"use strict";

const fs = require('fs');
const Epoll = require('epoll').Epoll;
const async = require('async');

const ORANGE_PI_PINS = {
  //'1' :  3.3v
  //'2' :  5v
  '3' : 12,
  //'4' :  5v
  '5' : 11,
  //'6' : ground
  '7' : 6,
  '8' : 198,
  //'9' : ground
  '10' : 199,
  '11' : 1,
  '12' : 7,
  '13' : 0,
  //'14' : ground
  '15' : 3,
  '16' : 19,
  //'17' : 3.3v
  '18' : 18,
  '19' : 15,
  //'20' : ground
  '21' : 16,
  '22' : 2,
  '23' : 14,
  '24' : 13,
  //'25' : ground
  '26' : 10
};

const PI_ZERO_PINS = {
  // 1: 3.3v
  // 2: 5v
  '3':  2,
  // 4: 5v
  '5':  3,
  // 6: ground
  '7':  4,
  '8':  14,
  // 9: ground
  '10': 15,
  '11': 17,
  '12': 18,
  '13': 27,
  // 14: ground
  '15': 22,
  '16': 23,
  // 17: 3.3v
  '18': 24,
  '19': 10,
  // 20: ground
  '21': 9,
  '22': 25,
  '23': 11,
  '24': 8,
  // 25: ground
  '26': 7,

  // Model B+ pins
  // 27: ID_SD
  // 28: ID_SC
  '29': 5,
  // 30: ground
  '31': 6,
  '32': 12,
  '33': 13,
  // 34: ground
  '35': 19,
  '36': 16,
  '37': 26,
  '38': 20,
  // 39: ground
  '40': 21
};

const PATH = '/sys/class/gpio';

const DIR_IN   = 'in';
const DIR_OUT  = 'out';

const LOW  = 'low';
const HIGH = 'high';

const EDGE_NONE    = 'none';
const EDGE_RISING  = 'rising';
const EDGE_FALLING = 'falling';
const EDGE_BOTH    = 'both';

class Gpio {
   constructor() {
      this.pollers = {};
      this.EDGE_NONE    = 'none';
      this.EDGE_RISING  = 'rising';
      this.EDGE_FALLING = 'falling';
      this.EDGE_BOTH    = 'both';
   }

   write(channel, value) {
     return new Promise((resolve, reject) => {
       const pin = PI_ZERO_PINS[channel];
       if (!pin) {
         return reject('Pin has not been exported for write');
       }
       value = (!!value && value !== '0') ? '1' : '0';
       fs.writeFile(PATH + '/gpio' + pin + '/value', value, function(err) {
          if (err)
              return reject(err);
           resolve(value);
       });
     });
   }

   read(channel, value) {
     return new Promise((resolve, reject) => {
       const pin = PI_ZERO_PINS[channel];
       if (!pin) {
         return reject('Pin has not been exported');
       }
       fs.readFile(PATH + '/gpio' + pin + '/value', 'utf-8', function(err, data) {
           if (err)
               return reject(err);

           data = (data + '').trim() || '0';
           resolve(data === '1');
       });
     });
   }

   _unexportPin(pin, callback) {
      // console.log('_unexportPin', PATH + '/unexport', pin);
       fs.writeFile(PATH + '/unexport', pin, callback);
   }

   _setup(channel, direction, edge) {
    //  echo 6 > /sys/class/gpio/export
    //  echo in > /sys/class/gpio/gpio6/direction
    //  echo both > /sys/class/gpio/gpio6/edge

    return new Promise((resolve, reject) => {
      const pin = PI_ZERO_PINS[channel];
      if (!pin) {
        return reject('Channel ' + channel + ' does not map to a GPIO pin');
      }

       function setEdge(callback) {
         //console.log('setEdge', PATH + '/gpio' + pin + '/edge');
           fs.writeFile(PATH + '/gpio' + pin + '/edge', edge, callback);
       }

       function setDirection(callback) {
        // console.log('setDirection', PATH + '/gpio' + pin + '/direction');
           fs.writeFile(PATH + '/gpio' + pin + '/direction', direction, callback);
       }

       function exportPin(callback) {
            //console.log('exportPin', PATH + '/export', pin);
           fs.writeFile(PATH + '/export', pin, callback);
       }

       function isExported(callback) {
           //console.log('isExported', PATH + '/gpio' + pin);
           fs.exists(PATH + '/gpio' + pin, (exists) => {
              callback(null, exists);
           });
       }

       let base = this;

       async.series(
         [
           function(callback) {
             isExported((error, exists) => {
               if (exists) {
                // console.log('exists')
                 base._unexportPin(pin, callback);
               } else {
                 callback();
               }
             })
           },
           exportPin,
           setDirection,
           setEdge
         ],
         function(error) {
           if (error) {
            reject(error);
           } else {
             resolve();
           }
         }
       )
    });
   }

   _listern(channel, callback) {

     const pin = PI_ZERO_PINS[channel];
     if (!pin) {
       throw 'Pin has not been exported';
       return;
     }

     let filename = PATH + '/gpio' + pin + '/value';
     console.log("listern channel", channel, filename);

     let buffer = new Buffer(1);

     this.pollers[channel] = new Epoll(function (err, fd, events) {
       // Read GPIO value file. Reading also clears the interrupt.
       fs.readSync(fd, buffer, 0, 1, 0);
       callback(buffer.toString() === '1');
     });

     let file = fs.openSync(filename, 'r');

     // Read the GPIO value file before watching to
     // prevent an initial unauthentic interrupt.
     fs.readSync(file, buffer, 0, 1, 0);

     // Start watching for interrupts.
     this.pollers[channel].add(file, Epoll.EPOLLPRI);
   }

   watch(channel, edge, callback) {
     let base = this;
     this._setup(channel, DIR_IN, edge)
        .then(() => {
          base._listern.call(base, channel, callback);
        })
        .catch(error => {
          console.error('Error', error);
        })

   }

   stopWatch() {
     const pin = PI_ZERO_PINS[channel];
     if (!pin) {
       throw 'Pin has not been exported';
       return;
     }

     let file = fs.openSync(PATH + '/gpio' + pin + '/value', 'r');

     this.pollers[channel].remove(file).close();

     this._unexportPin(pin);
   }
}

exports = module.exports = new Gpio;
