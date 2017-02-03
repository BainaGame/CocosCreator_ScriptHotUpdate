/** 
 * 热更新管理
 * Author      : donggang
 * Create Time : 2016.7.29
 * 
 * 需求说明:
 * 1、可后台更新版本资源
 */

var AssetsManager = require("AssetsManager"); 

var amManager = cc.Class({
    ctor : function(){
        this._updates    = {};            // 更新模块集合
        this._queue      = [];            // 更新对列
        this._isUpdating = false;         // 是否正在更新中
        this._current    = null;          // 当前正在更新的模块
        this._noComplete = {};            // 上次未完成的热更项
    }, 

    /** 
     * 获取模块版本信息 
     * @param localVersionCb(function)    本地版本信息加载完成
     * @param remoteVersionCb(function)   远程版本信息加载完成
     * 
     */
    getModules : function(remoteVersionCb){
        if (!cc.sys.isNative) {
            if (remoteVersionCb) remoteVersionCb();
            return;
        }

        game.asset.check(function(modules, versions){
             this.modules  = modules;
             this.versions = versions;
             if (remoteVersionCb) remoteVersionCb();
        }.bind(this));
    },

    /** 载入没更新完的模块状态 */
    load : function(){
        if (!cc.sys.isNative) return; 
        
        var data = cc.sys.localStorage.getItem("update_no_complete");
        if (data){
            var json = JSON.parse(data);
            for(var i = 0; i < json.length; i++){
                this._noComplete[json[i]] = json[i];
            }
            cc.sys.localStorage.removeItem("update_no_complete"); 
        }
    },

    getProgress : function(name){
        var am = this._updates[name];
        return am.getProgress();
    },
   
    /**
     * 初始化更新模块名
     * @param name(string)                 模块名
     * @param onCheckComplete(function)    检查版本完成
     * @param onComplete(function)         模块名
     * @param onProgress(function)         更新完成
     * @param onNewVersion(function)       已是最新版本
     */
    init : function(name, onCheckComplete, onComplete, onProgress, onNewVersion) {
        game.AssetConfig.concurrent = 2;
        
        var am = new AssetsManager();
        am.name = name;
        am.on(game.AssetEvent.NEW_VERSION                       , onNewVersion); 
        am.on(game.AssetEvent.PROGRESS                          , onProgress); 
        am.on(game.AssetEvent.FAILD                             , this._onFailed.bind(this)); 
        am.on(game.AssetEvent.NEW_VERSION_FOUND                 , this._onCheckComplete.bind(this)); 
        am.on(game.AssetEvent.SUCCESS                           , this._onUpdateComplete.bind(this)); 
        am.on(game.AssetEvent.REMOTE_VERSION_MANIFEST_LOAD_FAILD, this._onNetError.bind(this)); 
        am.on(game.AssetEvent.REMOTE_PROJECT_MANIFEST_LOAD_FAILD, this._onNetError.bind(this)); 
        am.on(game.AssetEvent.NO_NETWORK                        , this._onNetError.bind(this)); 
        am.onCheckComplete = onCheckComplete;
        am.onComplete      = onComplete;

        this._updates[name] = am;
    },

    /** 是否没完成 */
    isNoComplete : function(name){
        if (this._noComplete[name] == null)
            return false;
        
        return true;
    },

    /**
     * 检查版本是否需要更新
     */
    check : function(name){
        var am = this._updates[name];
        am.check(name);
    },

    /** 断网后恢复状态 */
    recovery : function(name){
        if (this._current && this._isUpdating == false){
            this._isUpdating = true;
            this._current.recovery();
        }
    },

    _onFailed : function(event){
        this._isUpdating = false;
        event.target.check(event.target.name);
    },

    _onNetError : function(event){
        this._isUpdating = false;
    },

    /** 检查版本完成 */
    _onCheckComplete : function(event){
        this._queue.push(event.target);
        
        // 保存下在下载的模块状态
        this._saveNoCompleteModule();

        if (event.target.onCheckComplete) event.target.onCheckComplete();

        if (this._isUpdating == false){
            this._isUpdating = true;
            this._current = event.target;
            this._current.update();
        }
    },

    _onUpdateComplete : function(event){
        if (event.target.onComplete) event.target.onComplete();  

        // 删除当前完成的更新对象
        this._queue.shift();
        this._isUpdating = false;

        // 保存下在下载的模块状态
        this._saveNoCompleteModule();

        // 更新对列中下一个更新对象
        if (this._queue.length > 0){
            this._isUpdating = true;
            this._current = this._queue[0];
            this._current.update();
        }
    },

    // 保存下在下载的模块状态
    _saveNoCompleteModule : function(){
        var names = [];
        for(var i = 0; i < this._queue.length; i++){
            names.push(this._queue[i].name);
        }
        cc.sys.localStorage.setItem("update_no_complete", JSON.stringify(names)); 
    }
});