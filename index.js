const auth = require('./auth.js');
const https = require('https');

module.exports = function (api) {
  api.registerPlatform("homebridge-mila", Mila);
};

var Mila = (function () {

  let homebridge, homebridgeLog, config;
  let milas = {};

  function Mila(log, config, api) {
    this.log = log;
    this.api = api;

    this.log("Mila called");

    homebridge = api;
    homebridgeLog = log;
    homebridgeConfig = config;

    pollMilas();
  };

  Mila.prototype = {
    configureAccessory: function (accessory) {
      this.log("configureAccessory called");

      accessory.on('identify', function () {
        this.log("Identify requested: " + accessory.displayName);
      });

      milas[accessory.UUID] = accessory;

    },
  };

  async function getMilas(accessToken) {
    return new Promise(function (resolve, reject) {
      const query = `{ owner { appliances { id room { id kind } sensors(kinds: [Temperature, Humidity]) { kind latest(precision: { unit: Minute value: ${new Date().getMinutes()} }) { value } } } } }`;
      const jsonPostBody = JSON.stringify({query: query});
      const request = https.request('https://api.milacares.com/graphql', {
        method: 'POST',
        headers: {
          "Authorization": 'Bearer ' + accessToken,
          'Content-Length': Buffer.byteLength(jsonPostBody),
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }, (res) => {
        if (res.statusCode != 200) {
          reject('failed to get milas: '+res.statusCode);
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve(JSON.parse(data));
        });
      });
      request.end(jsonPostBody);
    });
  }

  let accessToken;

  async function pollMilas() {
    if (!accessToken) {
      accessToken = await auth.newAccessToken(homebridgeConfig.username, homebridgeConfig.password, homebridgeLog);
    }

    try {
      const milaData = await getMilas(accessToken);
      homebridgeLog.debug(milaData);
      milaData.data.owner.appliances.forEach((appliance) => {
        const uuid = homebridge.hap.uuid.generate(appliance.id);
        let mila = milas[uuid];
        if (!mila) {
          homebridgeLog(`new mila found: ${appliance.id} ${appliance.room.kind}`);
          mila = new homebridge.platformAccessory(appliance.room.kind, uuid);
          mila.addService(homebridge.hap.Service.TemperatureSensor, 'Mila');
          mila.addService(homebridge.hap.Service.HumiditySensor, 'Mila');
          homebridge.registerPlatformAccessories('homebridge-mila', 'homebridge-mila', [mila]);
          milas[uuid] = mila;
        }

        appliance.sensors.forEach((sensor) => {
          const value = sensor.latest.value;
          if (sensor.kind == 'Temperature') {
            const adjusted = value - 1;
            const tempInF = (adjusted * 9) / 5 + 32;
            homebridgeLog(`${uuid} ${appliance.room.kind} temp: ${tempInF}`);
            const temperatureService = mila.getService(homebridge.hap.Service.TemperatureSensor);
            temperatureService.updateCharacteristic(homebridge.hap.Characteristic.CurrentTemperature, adjusted);
          }
          else if (sensor.kind == 'Humidity') {
            homebridgeLog(`${uuid} ${appliance.room.kind} humidity: ${value}`);
            const humidityService = mila.getService(homebridge.hap.Service.HumiditySensor);
            humidityService.updateCharacteristic(homebridge.hap.Characteristic.CurrentRelativeHumidity, value)
          }
        });
      });
    } catch (e) {
      homebridgeLog(e);
      accessToken = null;
    }
    setTimeout(() => {
      pollMilas();
    }, 60000);
  }

  return Mila;
}());
