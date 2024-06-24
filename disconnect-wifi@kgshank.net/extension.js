/*******************************************************************************
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 * 
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <http://www.gnu.org/licenses/>.
 * *****************************************************************************
 * Original Author: Gopi Sankar Karmegam
 ******************************************************************************/

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import NM from 'gi://NM';
import GLib from 'gi://GLib';
import {_log as _l, dump as _d, SignalManager} from './convenience.js';
//import * as Prefs from './prefs.js';

//const _l = Convenience._log
//const _d = Convenience.dump

const Gettext = imports.gettext.domain('disconnect-wifi');
const _ = Gettext.gettext;


const RECONNECT_TEXT = "Reconnect"
const SPACE = " ";

export default class WifiDisconnector extends Extension {
    enable() {
        this._nAttempts = 0;
        this._signalManager = new SignalManager();
        this._activeConnections = {};
        this._accessPoints = {};
        this._gsettings =  this.getSettings();
        // Note: Make sure don't initialize anything after this
        this._checkDevices().catch(error =>
            logError(error, 'Failed to setup quick settings'));
;
    }

    async _checkDevices() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        _l("Check Devices")
        await import('resource:///org/gnome/shell/ui/status/network.js');
        //const Main = await import('resource:///org/gnome/shell/ui/main.js');
        this._network = Main.panel.statusArea.quickSettings._network;
        _l(this._network._client)
        //_d(Main.panel.statusArea.quickSettings._indicators)
        if (this._network) {
            if (!this._network._client) {
                // Shell not initialized completely wait for max of
                // 100 * 1s
                if (this._nAttempts++ < 100) {
                    this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, this._checkDevices.bind(this));
                }
            } else {
                this._client = this._network._client;

                _l(this._network._wirelessToggle)
                for (let device of this._network._wirelessToggle._nmDevices) {
                    this._deviceAdded(this._client, device);
                }
                this._signalManager.addSignal(this._client, 'device-added', this._deviceAdded.bind(this));
                this._signalManager.addSignal(this._client, 'device-removed', this._deviceRemoved.bind(this));
                ///this._signalManager.addSignal(this._gsettings, "changed::" + Prefs.SHOW_RECONNECT_ALWAYS, this._setDevicesReconnectVisibility.bind(this));
            }
        }
    }

    _deviceAdded(client, device) {
        if (device.get_device_type() != NM.DeviceType.WIFI) {
            return;
        }

        if (device.active_connection) {
            this._activeConnections[device] = device.active_connection;
        }

        if (device.active_access_point) {
            this._accessPoints[device] = device.active_access_point;
        }
        this._addAllMenus(device);
    }

    _addAllMenus(device) {
        if (device) {
            _l("Adding menu..");

            /*
            if (!device._delegate) {
                _l("Device delegate not ready, waiting...");
                if (!device.timeout) {
                    device.timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => { this._addAllMenus(device) });
                    return true;
                } else {
                    return true;
                }
            }

            if (device.timeout) {
                GLib.source_remove(device.timeout);
                device.timeout = null;
            }*/

            //device.section.addMenuItem//

            /*
            this._mainSection = new PopupMenu.PopupMenuSection();
        this.add_child(this._mainSection.actor);

        this._submenuItem = new PopupMenu.PopupSubMenuMenuItem('', true);
        this._mainSection.addMenuItem(this._submenuItem);
        this._submenuItem.hide();

        this.section = new PopupMenu.PopupMenuSection();
        this._mainSection.addMenuItem(this.section);
*/
        _d(device)
            device._mainSection.addMenuItem('Menu Item', () => console.log('activated'));
            return;
            let wrapper = device._delegate;
            let menu = wrapper.item.menu;

            if (!wrapper.disconnectItem) {
                wrapper.disconnectItem = menu.addAction(_("Disconnect"), () => device.disconnect(null));
                menu.moveMenuItem(wrapper.disconnectItem, 2);
            }
            wrapper.disconnectItem.actor.visible = false;

            if (!wrapper.reconnectItem) {
                wrapper.reconnectItem = menu.addAction(_(RECONNECT_TEXT), () => { this._reconnect(device); });
                menu.moveMenuItem(wrapper.reconnectItem, 3);
            }

            wrapper.reconnectItem.actor.visible = false;

            this._stateChanged(device, device.state, device.state, null);

            this._signalManager.addSignal(device, 'state-changed', this._stateChanged.bind(this));
        }
        return false;
    }

    _reconnect(device) {
        _l(device + "=Device")

        if (this._RtimeoutId) {
            _l("Removing Timeout");
            GLib.source_remove(this._RtimeoutId);
            this._RtimeoutId = null;
        }
        _l(device.state);

        if (device.state > NM.DeviceState.DISCONNECTED) {
            if (device.state != NM.DeviceState.DEACTIVATING && device.state != NM.DeviceState.DISCONNECTING) {
                device.disconnect(null);
            }
            _l("Adding Timeout");
            this._RtimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => this._reconnect(device));
        }
        else {
            let _activeConnection = this._activeConnections[device];

            if (_activeConnection) {
                this._client.activate_connection_async(_activeConnection.connection, device, null, null, null);
            } else {
                this._client.activate_connection_async(null, device, null, null, null);
            }
        }
    }

    _stateChanged(device, newstate, oldstate, reason) {
        if (device.get_device_type() != NM.DeviceType.WIFI) {
            return;
        }

        if (device.active_connection) {
            this._activeConnections[device] = device.active_connection;
        }

        if (device.active_access_point) {
            this._accessPoints[device] = device.active_access_point;
        }

        if (!device._delegate) {
            return;
        }

        let wrapper = device._delegate;
        if (wrapper.disconnectItem) {
            wrapper.disconnectItem.actor.visible
                = newstate > NM.DeviceState.DISCONNECTED;
        }

        this._setReconnectVisibility(device, newstate);
    }

    _setReconnectVisibility(device, state) {
        _l("Device Current State: " + state);
        let wrapper = device._delegate;
        if (wrapper.reconnectItem) {
            let showReconnect = this._gsettings.get_boolean(Prefs.SHOW_RECONNECT_ALWAYS);

            let accessPoint = this._accessPoints[device];
            wrapper.reconnectItem.label.text =
                (accessPoint && accessPoint.get_ssid()) ? _(RECONNECT_TEXT) + SPACE
                    + imports.ui.status.network.ssidToLabel(accessPoint.get_ssid()) : _(RECONNECT_TEXT);

            wrapper.reconnectItem.actor.visible
                = (state == NM.DeviceState.DISCONNECTED || state == NM.DeviceState.DISCONNECTING || showReconnect);
        }
    }

    _deviceRemoved(client, device) {
        if (device.get_device_type() != NM.DeviceType.WIFI) {
            return;
        }
        if (this._activeConnections && this._activeConnections[device]) {
            this._activeConnections[device] = null;
        }

        if (this._accessPoints && this._accessPoints[device]) {
            this._accessPoints[device] = null;
        }

        if (!device._delegate) {
            return;
        }

        let wrapper = device._delegate;
        if (wrapper.disconnectItem) {
            wrapper.disconnectItem.destroy();
            wrapper.disconnectItem = null;
        }

        if (wrapper.reconnectItem) {
            wrapper.reconnectItem.destroy();
            wrapper.reconnectItem = null;
        }

        this._signalManager.disconnectBySource(device);
    }

    _setDevicesReconnectVisibility() {
        if (this._network && this._network._nmDevices) {
            for (let device of this._network._nmDevices) {
                this._setReconnectVisibility(device, device.state);
            };
        }
    }

    disable() {
        if (this._network && this._network._nmDevices) {
            for (let device of this._network._nmDevices) {
                this._stateChanged(device, device.state, device.state, "");
            };
        }
        this._signalManager.disconnectAll();
    }
};
