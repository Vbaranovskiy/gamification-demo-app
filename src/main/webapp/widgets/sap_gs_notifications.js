/** 
 *  SAP GAMIFICATION PLATFORM - Notification Module
 * 
 *  This module can be embedded into any given web application.
 *  Its main purpose is polling of new notifications for a specific user
 *  from a given gamification platform instance.
 *  The module and its API will be globally available as GSNotifications.
 *
 *  Author: Axel Schröder
 * 
 *  For questions please contact 
 *  axel.schroeder01@sap.com or philipp.herzig@sap.com
 *
 *  Supports SAP Gamification Platform v1.5
 **/
var GSNotifications = (function() {

    // debug mode
    var _debug = false;

    // holds the interval
    var _interval;
    var _polling = false;


    // config  at runtime
    var _config = {};

    // default config, dont touch!
    var _defaultConfig = {
        cssFile : "widgets/css/gs_notifications.css",
        iconDefault : "widgets/images/NotificationOTHER.png",
        defaultNotificationIcon : "Notification",
        widgetProxyURL: "ProxyServlet/JsonRPC", //used to send request to gamification service without running into cross-origin problems 
        interval : 2000,
        userName : "",
        duration : 5000,
        classList: "gs-notification",
        defaultClass : "gs-notification",
        limit : 3,
        offset : 50, // initial distance from page bottom
        showNotificationsYoungerThan : "",
        showPoints : true,
        stylePrimary : "background-color: #009de0",
        styleSecondary : "background-color: #40BEF5",
        appName: null,
        groupPoints: true
    };

    // TODO: currently notifications will always fade upwards from bottom
    var _highestBottom = _defaultConfig.offset;

    // holds all notification data
    // including all notifications that were already shown, that have to be displayed
    // and the onse that are currently displayed..
    var _notifications = {
        toBeDisplayed : [],
        haveBeenDisplayed : [],
        processedIds : [],
        displaying : [],
        history : []
    };


    function _NotificationNode(options) {

        this.iconSrc = (typeof options.iconSrc === "string")?
            options.iconSrc : _config.iconDefault;

        this.message = (typeof options.message === "string")?
            options.message : "unknown";

        this.classList = (typeof options.classList === "string")?
            options.classList : _config.classList;

        this.id = (typeof options.id === "string")?
            options.id : "";

        this.bottom = (typeof options.bottom === "string")?
            options.bottom : _config.offset;

        if (typeof options.importance === "string") {

            this.importance = options.importance;

        } else {

            this.importance = "low";

        }

        _NotificationNode.prototype.getNode = function () {

            var node = document.createElement("div");

            node.innerHTML = "<div><img></div>"+
            "<div class=\"gs-notification-content\">DummyContent</div>";
            // node.className = this.classList + " " + this.importance;
            node.className = this.classList;
            node.importance = this.importance;
            node.style.backgroundColor = (this.importance === "high")?
                _config.stylePrimary : _config.styleSecondary;

            node.targetBottom = options.bottom;
            node.id = "GSnotification_" + this.id;

            node.children[0].className = "gs-notification-icon";
            node.children[0].children[0].src = this.iconSrc;
            node.children[1].className = "gs-notification-content";
            node.children[1].innerHTML = this.message;

            return node;

        };
    }

    function _init(config) {

        _setConfig(config, true);
        _injectCSSFile();
        _getServerTime();

        // repeatedly let the module check for new notifications
        clearInterval(_interval);
        _interval = setInterval(_poll, _config.interval);
        _log("Notification module loaded.");

        var loadedEvent = new CustomEvent(
            "gs-notification-ready"
        );
        document.dispatchEvent(loadedEvent);

    }

    // Injects a <link> tag into the site header, which loads the corresponding css file
    function _injectCSSFile() {

        if (document.getElementById("GSNotificationCSS") === null) {

            var link = document.createElement("link");
            link.id = "GSNotificationCSS";
            link.href = _config.cssFile;
            link.type = "text/css";
            link.rel = "stylesheet";
            document.getElementsByTagName("head")[0].appendChild(link);

        }

    }

    // converts strings like "20131016T110515.718+0200" into a usable date
    function _formatDate(sJsonDate) {

        var isoString = "";

        isoString += sJsonDate.substring(0,4) + "-";
        isoString += sJsonDate.substring(4,6) + "-";
        isoString += sJsonDate.substring(6,8) + "T";
        isoString += sJsonDate.substring(9,11) + ":";
        isoString += sJsonDate.substring(11,13) + ":";
        isoString += sJsonDate.substring(13,22) + ":";
        isoString += sJsonDate.substring(22,24);
        
        return new Date(isoString).getTime();

    }
    function _getIconUrl (category, icon) {

    	return "widgets/images/Notification" + category + ".png";
        
    }

    function _poll() {

        var newNotifications = 0;
        var request = {
        		method: "getNotificationsForPlayer",
        		id: 1,
        		params: [_config.userName, 20] 
        };

        _polling = true;

        _sendAPIRequest(request, null, function (data) {
            // TODO: refactor to get rid of this horrible if stack
            var receivedHistory = false;
            var prevNoti = { index: 0, target : ""};

            if (data.result !== null) {

                if (data.result.length > 0){

                    // prepare notifications data, check if they werent already shown
                    for (var i = 0; i < data.result.length; i++) {

                        data.result[i].dateCreated = _formatDate(data.result[i].dateCreated);

                        // only process notifications once
                        if (_notifications.processedIds.indexOf(data.result[i].id) === -1){

                            if ((data.result[i].dateCreated) > _config.showNotificationsYoungerThan)  {

                                // everything that is no "point" notification, will be shown
                                if (data.result[i].category !== "POINT") {

                                    _notifications.toBeDisplayed.push(data.result[i]);

                                } else if (_config.showPoints) {
                                    
                                    if (!_config.groupPoints) {

                                        _notifications.toBeDisplayed.push(data.result[i]);

                                    } else {

                                        //check if there are already notifications to show
                                        if (_notifications.toBeDisplayed.length>0) {

                                            // check planned notifications for equal point types that could be used 
                                            // for grouping with the current notification (data.result[i])
                                            for (var j = 0 ; j < _notifications.toBeDisplayed.length; j++) {
                                                // add the amount to the already existing notification
                                                if (_notifications.toBeDisplayed[j].target === data.result[i].target) {
                                                    _notifications.toBeDisplayed[j].amount += data.result[i].amount ;
                                                    break;
                                                }
                                                // if the point type wasnt already existing, add it as a new notification
                                                if (j === _notifications.toBeDisplayed.length-1) {
                                                    _notifications.toBeDisplayed.push(data.result[i]);
                                                    break;
                                                }
                                            }

                                        } else {

                                            _notifications.toBeDisplayed.push(data.result[i]);

                                        }

                                    }
                                    
                                }
                                                
                            } else {
                                
                                _notifications.history.push(data.result[i]);
                                receivedHistory = true;

                            }
                            newNotifications ++;
                            _notifications.processedIds.push(data.result[i].id);

                        }

                    }

                    _log("Received notifications: " + data.result.length + " (" +
                        newNotifications + " new)");


                    // globally announce that older notifications are available
                    if(receivedHistory) {
                        var notificationsEvent = new CustomEvent(
                            "gs-notification-history"
                        );
                        document.dispatchEvent(notificationsEvent);
                    }


                    // generate notifications
                    _prepareAndInjectNotifications();


                } else {

                    _log("No notifications available. Make sure your GP instance has rules in place.");

                }
    
            } else {

                _log("Server Error: " + data.error);

            }

            _polling = false;

        });

    }
    function _prepareAndInjectNotifications() {

        var body = document.getElementsByTagName("body")[0];
        var limit = Math.min(_config.limit - _notifications.displaying.length,
                _notifications.toBeDisplayed.length);

        _highestBottom = _config.offset + _notifications.displaying.length * 60;
        var message = "";

        for (var i = 0 ; i < limit ; i++){
            
            var n = _notifications.toBeDisplayed[i];
            message = "";
            switch(n.category) {

                case "POINT" :
                    message += "+" + n.amount + " " + n.target;
                    break;
                case "MISSION" :
                    if (n.type === "ADD") {
                        message += "New Mission: " + n.target;
                    } else if (n.type === "COMPLETE") {
                        message += "Completed: " + n.target;
                    } else {
                        _log("please check notifications text generator. server " +
                            "side data structure may has changed");
                    }
                    break;
                case "BADGE":
                    message += "Earned: " + n.target;
                    break;
                default :
                    break;

            }

            var notificationNode = new _NotificationNode({

                id: n.id,
                message: message,
                classList: _config.classList,
                bottom: _highestBottom + i*60,
                iconSrc: _getIconUrl(n.category, n.icon),
                importance: (n.category !== "POINT")? "high" : "low"

            });
            
            n.node = notificationNode.getNode();
            n.start = new Date().getTime();
            n.duration = _config.duration;

            body.appendChild(n.node);
            
            setTimeout(_showNotification, 500+(i*500));
            // setTimeout(_hideNotification, 500);

        }

    }

    function _showNotification (){

        var n = _notifications.toBeDisplayed[0];

        if (n !== undefined && n.node !== undefined){

            n = _notifications.toBeDisplayed.shift();
            n.node.className += " gs-notification-visible";

            n.node.setAttribute("style", n.node.getAttribute("style") + "bottom: " + n.node.targetBottom + "px;");
            _notifications.displaying.push(n);
            _calcNewBottoms();
            setTimeout(_removeNotification, n.duration);

        }

    }
    function _removeNotification () {
        
        var body = document.getElementsByTagName("body")[0];

        var n = _notifications.displaying[0];
        
        if (n !== undefined && n.node !== undefined){

            n = _notifications.displaying.shift();
            n.node.className = _config.classList;
            _notifications.haveBeenDisplayed.push(n);

            var notificationsEvent = new CustomEvent(
                "gs-notification-new"
            );
            document.dispatchEvent(notificationsEvent);

            setTimeout(function () {

                body.removeChild(n.node);
                _calcNewBottoms();

            }, 250);

        }
        
    }
    function _calcNewBottoms() {

        var style = "";
        for (var i = 0; i < _notifications.displaying.length; i++){

            style = (_notifications.displaying[i].node.importance === "high") ?
                _config.stylePrimary : _config.styleSecondary;
            style += "; ";
            style += "bottom: " + (_config.offset + (i*60)) + "px;";

            _notifications.displaying[i].node.setAttribute("style", style);

        }

    }
    /** 
     * manually polls notifications from the server. 
     */
    function _manualPoll () {

        if (!_polling){

            clearInterval(_interval);
            _poll();
            _interval = setInterval(_poll, _config.interval);

        }

    }

    function _sendAPIRequest(mParams, oAjaxParams, fnSuccessCallback, fnErrorCallback) {

        var sUrl;
        var xmlHttpRequest = false;
        var request = "json="+JSON.stringify(mParams);
        
        if (_config.appName !== null && _config.appName !== undefined && _config.appName !== "") {

            request += "&app=" + _config.appName;

        }

        if (oAjaxParams && typeof oAjaxParams.url === "string" && oAjaxParams.url !== ""){
            
            sUrl = oAjaxParams.url;

        } else {
           sUrl = _config.widgetProxyURL;            
        }
            
        if (window.XMLHttpRequest) {
            // All Modern Browsers
            xmlHttpRequest = new XMLHttpRequest();

        }else if (window.ActiveXObject) {
            // IE6 + IE5
            xmlHttpRequest = new ActiveXObject("Microsoft.XMLHTTP");

        }
     
        // If AJAX supported
        if(xmlHttpRequest !== false) {
            // Open Http Request connection
            xmlHttpRequest.open("POST", sUrl, true);
            // Set request header (optional if GET method is used)
            // xmlHttpRequest.setRequestHeader('Content-Type', 'application/json');
            xmlHttpRequest.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            
            // Callback when ReadyState is changed.
            xmlHttpRequest.onreadystatechange = function() {

                if (xmlHttpRequest.readyState === 4) {

                    if (xmlHttpRequest.status === 200) {

                        var data = JSON.parse(xmlHttpRequest.responseText);
                        fnSuccessCallback(data);

                    } else {

                        if (typeof fnErrorCallback === "function") {

                            fnErrorCallback(xmlHttpRequest);

                        } else {

                            console.log("[GamificationService] Server Error on request.");

                        }

                    }

                }

            };
            xmlHttpRequest.send(request);

        } else {

            console.log("[GamificationService] Notifications require a browser that supports ajax.");

        }
    }
    function _log (sText){

        if (_debug) {

            console.log("[GamificationService] " + sText);

        }

    }
    /** 
     * group similar notifications together
     */
    function _groupPoints(bState) {

        if (typeof bState === "boolean"){

            _config.groupPoints = bState;
            console.log("[Gamification Service] Grouping point notifications is now " + ((bState)? "enabled." : "disabled."));

        } else {

            _log("ERROR. " + bState + " must be of type boolean.");

        }
    }
    /**
     * multi app support: define the current app context. The module uses 
     * the default app as a default.
     */
    function _setAppName (sAppName) {

        if (typeof sAppName === "string" && sAppName !== ""){

            var oldApp = (_config.appName === undefined || _config.appName === null)? "[DefaultApp]" : _config.appName;

            _config.appName = sAppName;
            _log("App context changed from: " + oldApp + " to " + sAppName);

        } else {

            _log("Please provide a valid string. App context continues to be " +
                (_config.appName === undefined || _config.appName === null)?
                    "default app" : _config.appName);

        }
    }
    /**
     * expects an object with config parameters. see getConfig() for
     * possible parameters
     */
    function _setConfig(config) {
       
       var config = config || {};
       
        if (typeof config === "object" &&
            config.length === undefined) {

            for (var attr in _defaultConfig) {

                if (config.hasOwnProperty(attr)) {

                    if (attr === "classList") {

                        _setStyleClasses(config[attr]);

                    } else {

                        _config[attr] = config[attr];

                    }

                }else{

                    _config[attr] = _defaultConfig[attr];

                }

            }

        } else {

               _log("Config must be of type Object");

        }

    }
    function _getServerTime(){

        var reqParams ='{"id":1,"method":"getCurrentServerTime", "params":[]}';
        var request = JSON.parse(reqParams);

        _sendAPIRequest(request, null, function (data) {

            if (data.result !== null) {

                var serverTime = _formatDate(data.result);
                _config.showNotificationsYoungerThan = serverTime;
                console.log("[Gamification Service] Current server time: " + new Date(serverTime));

            }

        });

    }
    /**
     * returns the current module config
     */
    function _getConfig () {

        return _config;

    }
    /**
     * returns two arrays, containing your
     * notifications history - latest 20 notifications from the server 
     * (before the module was loaded) shown notifications - all notifications that
     * the module already displayed
     */

    function _getNotifications () {

        var result ={
            newNotifications : _notifications.haveBeenDisplayed,
            history : _notifications.history
        };
        return result;

    }
    /**
     * sets the poll interval to the provided interval (default: 2000)
     */
    function _setPollInterval(iInterval) {

        if (typeof iInterval === "number"){

            _config.interval = iInterval;
            clearInterval(_interval);
            _interval = setInterval(_poll, _config.interval);
            _log("Polling interval set to: " + iInterval + "ms.");

        } else {
            _log("Interval must be an integer");
        }

    }
    /**
     * limits the simultaneously shown notifications to avoid 
     * spamming the user (default: 3) 
     */
    function _setNotificationLimit(iLimit) {

        if (isInt(iLimit) && iLimit > 0 && iLimit <= 20) {

            _config.limit = iLimit;
            _log("Maximum for visible notifications is now set to: " + _config.limit);

        } else {

            _log("Please provide a valid number between 1 and 20");

        }

    }
    /**
     * the module will poll notifications only from the specified user. 
     */
    function _setUserName (sUserName) {

        if (typeof sUserName === "string"){

            _config.userName = sUserName;
            _log("Notifications are now polled for User: " + sUserName);

        } else {

            _log("ERROR. " + sUserName + "must be of type string");

        }

    }
    /**
     * true (default) lets the module show all notifications including 
     * the very basic ones like "user gained 1 point" false lets the module 
     * only display important notifications like "mission completed" or "badge earned"
     */
    function _showPoints (bState) {

        if (typeof bState === "boolean"){

            _config.showPoints = bState;
            console.log("[Gamification Service] Notifications for earned points are now " + ((bState)? "enabled." : "disabled."));

        } else {

            _log("ERROR. " + bState + " must be of type boolean.");

        }

    }
    /**
     * true (default) - provides detailed console output
     * false - disable all console outputs
     */
    function _setDebugMode (bState) {

        if (typeof bState === "boolean"){

            _debug = bState;
            _log("DebugMode is now " + ((bState)? "enabled." : "disabled."));

        } else {

            _log("ERROR. " + bState + " must be of type boolean.");

        }

    }
    /**
     * expects an array filled with strings. all contained strings will 
     * be appended as style class for each notification 
     */
    function _setStyleClasses (sClassList) {

        if (typeof sClassList === "object" && sClassList.length !== undefined){

            _config.classList = _defaultConfig.defaultClass;
            for (var i = 0 ; i < sClassList.length; i++){

                if (typeof sClassList[i] === "string") {

                    _config.classList += " " + sClassList[i];
                    _log("StyleClasses have been applied.");

                } else if(_debug) {

                    _log("RROR. " + sClassList + "must be an array filled with strings.");

                }

            }

        } else {

            _log("ERROR. " + sClassList + "must be an array filled with strings.");

        }

    }
    
    
    return {

        init : _init,                               // setup for first start
        poll : _manualPoll,                         // manually poll, stops and restarts the poll interval

        getConfig : _getConfig,                     //get current config
        getNotifications : _getNotifications,       // get data from all shown notifications

        showPoints : _showPoints,                   // also display notifications from points (default:true)
        setPollInterval : _setPollInterval,         // set the polling interval (default: 7000ms)
        setUserName : _setUserName,                 // define for which user the module is polling
        setDebugMode : _setDebugMode,               // switch debug mode on or off for more console output
        setStyleClasses : _setStyleClasses,         // list all styleclasses but dont forget to 
        setNotificationLimit : _setNotificationLimit,        
        restoreDefaultConfig : _setConfig,
        setConfig : _setConfig,
        setAppName : _setAppName,                   // multi app support
        groupPoints : _groupPoints,                 // group similar notifications together
        
    };

}());
