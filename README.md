# homebridge-mila
homebridge support for https://milacares.com based on https://gist.github.com/sanghviharshit/913d14b225399e0fa4211b3e785671aa

I got tired of waiting for HomeKit support, so I hacked this together. It currently only exposes temperature and humidty.

Lots more to do: 

- [ ] Expose auto/manual mode as a fan device
- [ ] Clean up nested network calls and handle all the failure cases
- [ ] Configure what sensors are exposed
- [ ] Allow sensor offset calibration (temperature sensors are currently offest by 1 C because that's what my device is off by)
