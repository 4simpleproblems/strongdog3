// Timer Implementation that uses GAN Smart Timer via its Bluetooth protocol
execMain(function(timer) {
	"use strict";

	var enable = false;
	var inspectionTime = 0;

	function onGanTimerEvent(timerEvent) {
		if (!enable)
			return;
		DEBUG && console.log('[gantimer] timer event received', GanTimerState[timerEvent.state], timerEvent);
		switch (timerEvent.state) {
			case GanTimerState.HANDS_ON: // both hands placed on timer
				timer.lcd.color('r');
				break;
			case GanTimerState.HANDS_OFF: // hands removed from timer before grace period expired
				timer.lcd.fixDisplay(false, true);
				break;
			case GanTimerState.GET_SET:   // grace period expired and timer is ready to start
				timer.lcd.color('g');
				break;
			case GanTimerState.IDLE: // timer reset button pressed
				inspectionTime = 0;
				if (timer.hardTime() > 0 || timer.status() != -1) { // reset timer / cancel inspection timer
					timer.hardTime(0);
					timer.status(-1);
					timer.lcd.reset();
					timer.lcd.fixDisplay(false, true);
				} else if (timer.status() == -1 && timer.checkUseIns()) { // start inspection timer if was idle and inspection enabled in settings
					timer.status(-3);
					timer.startTime($.now());
					timer.lcd.fixDisplay(false, true);
				}
				timer.lcd.renderUtil();
				break;
			case GanTimerState.RUNNING: // timer is started
				if (timer.status() == -3) { // if inspection timer was running, record elapsed inspection time
					inspectionTime = $.now() - timer.startTime();
					// 0 == Normal, 2000 == +2, -1 == DNF
					inspectionTime = timer.checkUseIns() ? inspectionTime > 17000 ? -1 : (inspectionTime > 15000 ? 2000 : 0) : 0;
				}
				timer.startTime($.now());
				timer.lcd.reset();
				timer.curTime([inspectionTime]);
				timer.status(1);
				timer.lcd.fixDisplay(false, true);
				break;
			case GanTimerState.STOPPED: // timer is stopped, recorded time returned from timer
				timer.hardTime(timerEvent.recordedTime.asTimestamp);
				timer.curTime()[1] = timer.hardTime();
				timer.status(-1);
				timer.lcd.renderUtil();
				timer.lcd.fixDisplay(false, true);
				kernel.pushSignal('time', timer.curTime());
				break;
			case GanTimerState.DISCONNECT: // timer is switched off or something else
				timer.hardTime(null);
				timer.status(-1);
				timer.lcd.renderUtil();
				timer.lcd.fixDisplay(false, true);
				reconnectTimer();
				break;
		}

	}

	function reconnectTimer() {
		$.delayExec('ganTimerReconnect', function () {
			DEBUG && console.log('[gantimer] attempting to reconnect timer device');
			connectTimer(true);
		}, 2500);
	}

	function connectTimer(reconnect) {
		GanTimerDriver.connect(reconnect).then(function () {
			DEBUG && console.log('[gantimer] timer device successfully connected');
			GanTimerDriver.setStateUpdateCallback(onGanTimerEvent);
			timer.hardTime(0);
			timer.status(-1);
			timer.lcd.reset();
			timer.lcd.renderUtil();
			timer.lcd.fixDisplay(false, true);
		}).catch(function (err) {
			DEBUG && console.log('[gantimer] failed to connect to timer', err);
			if (!reconnect) {
				alert(err);
			}
		});
	}

	function showConnectionDialog() {
		var inspMsg = $('<div>').addClass('click')
			.append('If you have enabled WCA inspection in settings,<br>use GAN logo button right on the timer to start/cancel inspection.');
		var dialogMsg = $('<div>')
			.append('<br><br>')
			.append('<b>Press OK to connect to GAN Smart Timer</b>')
			.append('<br><br>')
			.append(inspMsg)
			.append(timer.getBTDiv());
		disconnectTimer().then(function () {
			kernel.showDialog([dialogMsg, function () {
				connectTimer();
			}, 0, 0], 'share', 'GAN Smart Timer');
		});
	}

	function disconnectTimer() {
		return GanTimerDriver.disconnect();
	}

	function setEnableImpl(input) {
		enable = input == 'b';
		if (enable) {
			timer.hardTime(null);
			showConnectionDialog();
		} else {
			disconnectTimer();
		}
	}

	function onKeyUpImpl(keyCode) {
		if (keyCode == 32 && !GanTimerDriver.isConnected()) {
			showConnectionDialog();
		}
	}

	timer.gan = {
		setEnable: setEnableImpl,
		onkeyup: onKeyUpImpl,
		onkeydown: $.noop
	};
}, [timer]);
