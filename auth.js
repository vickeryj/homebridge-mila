const https = require('https');
const querystring = require('querystring');
const crypto = require('crypto');
const url = require('url');

function decodeEntities(encodedString) {
    var translate_re = /&(nbsp|amp|quot|lt|gt);/g;
    var translate = {
        "nbsp":" ",
        "amp" : "&",
        "quot": "\"",
        "lt"  : "<",
        "gt"  : ">"
    };
    return encodedString.replace(translate_re, function(match, entity) {
        return translate[entity];
    }).replace(/&#(\d+);/gi, function(match, numStr) {
        var num = parseInt(numStr, 10);
        return String.fromCharCode(num);
    });
}

let log;

const newAccessToken = async function (username, password, customLogger) {
  log = customLogger;

  const nonce = crypto.randomBytes(40).toString('base64');
  const state = crypto.randomBytes(40).toString('base64');

  let codeVerifier = crypto.randomBytes(40).toString('base64');
  codeVerifier = codeVerifier.replace(/[^a-zA-Z0-9]+/g, '');

  let codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64');
  codeChallenge = codeChallenge.replace(/\+/g, '-');
  codeChallenge = codeChallenge.replace(/\//g, '_');
  codeChallenge = codeChallenge.replace(/=/g, '');

  const queryString = {
    "response_type": "code",
    "client_id": "prod-ui",
    "nonce": nonce, "scope": "openid,profile",
    "redirect_uri": "milacares://anyurl.com/",
    "state": state,
    "code_challenge": codeChallenge,
    "code_challenge_method": "S256"
  };

  return new Promise(function (resolve, reject) {
    https.get('https://id.milacares.com/auth/realms/prod/protocol/openid-connect/auth?' + querystring.stringify(queryString), (res) => {
      log.debug("statusCode=" + res.statusCode);
      if (res.statusCode != 200) {
        log(res.headers['location']);
        log(codeVerifier);
        log(codeChallenge);
        reject('failed to setup auth');
        return;
      }

      let cookies = res.headers['set-cookie'];
      cookies = cookies.map(c => c.substr(0, c.indexOf(';'))).reduce((a, b) => a + '; ' + b)
      log.debug(cookies);

      let loginData = '';
      res.on('data', (chunk) => { loginData += chunk; });
      res.on('end', () => {
        try {
          const formUrl = decodeEntities(loginData.match(/kc-form-login.+action=\"([^\"]+)"/)[1]);
          const requestBody = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
          const post = https.request(formUrl, {
            method: 'POST',
            headers: {
              'Cookie': cookies,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(requestBody),
            }
          }, (res) => {
            log.debug("statusCode=" + res.statusCode);
            let formSubmitData = '';
            res.on('data', (chunk) => { formSubmitData += chunk; });
            res.on('end', () => {
              log.debug(formSubmitData);
              if (!res.headers['location']) {
                reject('login failed');
                return;
              }
              const redirect = new url.URL(res.headers['location']);
              log.debug(redirect);
              const code = redirect.searchParams.get('code');
              log.debug(code);
              const accessTokenUrl = "https://id.milacares.com/auth/realms/prod/protocol/openid-connect/token"
              const accessTokenRequestBody = `grant_type=authorization_code&client_id=prod-ui&redirect_uri=${encodeURIComponent('milacares://anyurl.com/')}&code=${code}&code_verifier=${codeVerifier}`;
              const accessPost = https.request(accessTokenUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Content-Length': Buffer.byteLength(accessTokenRequestBody),
                }
              }, (res) => {
                log.debug("statusCode=" + res.statusCode);
                let formSubmitData = '';
                res.on('data', (chunk) => { formSubmitData += chunk; });
                res.on('end', () => {
                  try {
                    const json = JSON.parse(formSubmitData);
                    resolve(json.access_token);
                  } catch (e) {
                    reject(e);
                  }
                });
              });
              accessPost.end(accessTokenRequestBody);
            });
          });
          post.end(requestBody);

        } catch (e) {
          console.error(e.message);
          reject(e);
        }
      });
    });
  });
}

function getDeviceInfo(accessToken) {
  return new Promise(function (resolve, reject) {
    const query = '{ owner { appliances { id room { id } } } }';
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
      log.debug("statusCode=" + res.statusCode);
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        log.debug(data);
        resolve(JSON.parse(data).data.owner.appliances);
      });
    });
    request.end(jsonPostBody);
  });
}

function getSensor(accessToken, deviceId) {
  return new Promise(function (resolve, reject) {
    const query = `{ owner { appliances { id name room { id name kind } sensors(kinds: [Temperature, Humidity]) { kind latest(precision: { unit: Minute value: ${new Date().getMinutes()} }) { value } } } } }`;
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
      log.debug("statusCode=" + res.statusCode);
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve(data);
      });
    });
    request.end(jsonPostBody);
  });

}


module.exports.newAccessToken = newAccessToken;
