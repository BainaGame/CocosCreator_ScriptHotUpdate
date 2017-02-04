/** 
 * 游戏服务器管理
 * Author      : donggang
 * Create Time : 2016.8.19
 */
var HttpRequest = {};
var urls        = {};           // 当前请求地址集合

game.HttpEvent = {};
game.HttpEvent.NO_NETWORK    = "http_request_no_network";               // 断网
game.HttpEvent.UNKNOWN_ERROR = "http_request_unknown_error";            // 未知错误

game.http = module.exports = {
    /**
     * HTTP GET请求
     * 例：
     * 
     * Get
        var url = "http://httpbin.org/get?show_env=1";
        var complete = function(response){
               
            cc.log(response);
        }
        var error = function(response){
            cc.log(response);
        }
        game.HttpRequest.get(url, complete, error);
    */
    get : function(url, completeCallback, errorCallback){
        game.http.sendRequest(url, null, false, completeCallback, errorCallback)
    },

    getByArraybuffer : function(url, completeCallback, errorCallback){
        game.http.sendRequest(url, null, false, completeCallback, errorCallback, 'arraybuffer');
    },

    getWithParams : function(url, params, completeCallback, errorCallback){
        game.http.sendRequest(url, params, false, completeCallback, errorCallback)
    },

    getWithParamsByArraybuffer : function(url, params, callback, errorCallback){
        game.http.sendRequest(url, params, false, completeCallback, errorCallback, 'arraybuffer');
    },

    /** 
     * HTTP POST请求
     * 例：
     *      
     * Post
        var url = "http://192.168.1.188/api/LoginNew/Login1";
        var param = '{"LoginCode":"donggang_dev","Password":"e10adc3949ba59abbe56e057f20f883e"}'
        var complete = function(response){
                var jsonData = JSON.parse(response);
                var data = JSON.parse(jsonData.Data);
            cc.log(data.Id);
        }
        var error = function(response){
            cc.log(response);
        }
        game.HttpRequest.post(url, param, complete, error);
    */
    post : function(url, params, completeCallback, errorCallback){
        game.http.sendRequest(url, params, true, completeCallback, errorCallback);
    },

    /**
     * 获得字符串形式的参数
     */
    _getParamString : function(params){
        var result = "";
        for(var name in params){
            result += "{0}={1}&".format(name, params[name]);
        }

        return result.substr(0, result.length - 1);
    },


    /** 
     * Http请求 
     * @param url(string)               请求地址
     * @param params(JSON)              请求参数
     * @param isPost(boolen)            是否为POST方式
     * @param callback(function)        请求成功回调
     * @param errorCallback(function)   请求失败回调
     * @param responseType(string)      响应类型
     */
    sendRequest : function(url, params, isPost, completeCallback, errorCallback, responseType){
        if (url == null || url == '')
            return;

        var newUrl;
        if (params) {
            newUrl = url + "?" + this._getParamString(params);
        }
        else {
            newUrl = url;
        }

        if (urls[newUrl] != null){
            cc.warn("地址【{0}】已正在请求中，不能重复请求".format(url));
            return;
        }

        // 防重复请求功能
        urls[newUrl] = true;

        var xhr = cc.loader.getXMLHttpRequest();
        if (isPost){
            xhr.open("POST", url);
        }
        else {
            xhr.open("GET", newUrl);
        }

        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

        xhr.onerror = function() {
            delete urls[newUrl];
            if (errorCallback == null) return;
            if (xhr.readyState == 1 && xhr.status == 0){
                errorCallback(game.HttpEvent.NO_NETWORK);               // 断网
            }
            else{
                errorCallback(game.HttpEvent.UNKNOWN_ERROR);            // 未知错误
            }
        };

        xhr.onreadystatechange = function() {
            if (xhr.readyState != 4) return;

            delete urls[newUrl];
            if (xhr.status == 200){
                if(completeCallback) {
                    if (responseType == 'arraybuffer') { 
                        xhr.responseType = responseType;
                        completeCallback(xhr.response);                 // 加载非文本格式
                    } 
                    else {
                        completeCallback(xhr.responseText);             // 加载文本格式
                    }                    
                }                    
            } 
            else {
                if(errorCallback) errorCallback(xhr.status);
            }
        };

        if (params == null || params == ""){
            xhr.send();
        }
        else {
            xhr.send(JSON.stringify(params));
        }
    }
}