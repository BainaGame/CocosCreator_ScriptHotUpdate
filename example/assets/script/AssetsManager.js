/** 
 * 资源管理
 * Author      : donggang
 * Create Time : 2016.11.26
 * 
 * 需求：
 * 1、版本配置文件对比，提示有新版本
 * 2、版本清单文件对比，分析需要更新的资源文件
 * 3、批量下载更新的资源文件保存到系统本地存储目录
 * 4、批量删除服务器清单文件中没有的资源文件
 * 5、更新失败或异常中断时，记录更新状态，下次触发更新时恢复更新进度，不下载已更新的文件
 * 6、智能队列更新资源文件，以游戏 fps 数据做为动态计算更新速度（手机性能不够，暂时没必要做）
 * 7、版本回退功能，通过查询目录的顺序，把版本版本的更新文件放到查询目录中（思考）
 * 8、版本文件摘要验证功能（思考）
 * 9、配置文件的数据内存是没有删除的（思考是否需要做处理）
 */

// 本地缓存关键字
var LOCAL_STORAGE_FOLDER           = "game-remote-asset";       // 版本资源目录
var LOCAL_STORAGE_KEY_PROJECT      = "update_project";          // 本地缓存清单数据
var LOCAL_STORAGE_KEY_UPDATE_STATE = "update_state";            // 本地缓存更新状态数据（每完成一个资源下载会记录完成数据队列)
var MODULE_PROJECT_MANIFEST_PATH   = "version/{0}_project";     // 模块清单路径

// 事件
game.AssetEvent = {};
game.AssetEvent.NEW_VERSION                        = "asset_new_version";                           // 已是最新版本
game.AssetEvent.NEW_VERSION_FOUND                  = "asset_new_version_found";                     // 找到新版本
game.AssetEvent.SUCCESS                            = "asset_success";                               // 更新成功
game.AssetEvent.FAILD                              = "asset_failed";                                // 更新失败
game.AssetEvent.PROGRESS                           = "asset_progress";                              // 更新进度
game.AssetEvent.LOCAL_PROJECT_MANIFEST_LOAD_FAIL   = "asset_local_project_manifest_load_fail";      // 获取游戏中路安装包中资源清单文件失败
game.AssetEvent.REMOTE_VERSION_MANIFEST_LOAD_FAILD = "asset_remote_version_manifest_load_faild";    // 获取远程版本配置文件失败
game.AssetEvent.REMOTE_PROJECT_MANIFEST_LOAD_FAILD = "asset_remote_project_manifest_load_faild";    // 获取远程更新单清文件失败
game.AssetEvent.NO_NETWORK                         = "asset_no_network";                            // 断网

// 配置
game.AssetConfig               = {};
game.AssetConfig.debugVersion  = false;                                                     // 无视版本号测试
game.AssetConfig.debugRes      = false;                                                     // 无视资源版本对比测试
game.AssetConfig.debugProgress = false;                                                     // 打印进度日志
game.AssetConfig.testIp        = "172.18.254.56";                                           // 测试服务器地址
game.AssetConfig.testCdn       = "http://" + game.AssetConfig.testIp + "/update/";          // 测试 CDN 服务器地址

game.AssetConfig.concurrent    = 1;                                   // 最大并发更新文件数量（有网络IO和文件IO并载数量在边玩游戏边下载时建议不超过2）
game.AssetConfig.line          = "line1";                             // 版本线路文件夹，用于更新时优先更新没有用的线路，测试成功后切换热更

var AssetsDownload = require("AssetsDownload");
var AssetsManager  = cc.Class({ 
    extends : cc.EventTarget,

    /** 更新进度 */ 
    getProgress : function(){
        return this._progress;
    }, 

    /**
     * 对比服务器版本信息
     * @param appManifestPath(string)       本地清单文件路径
     */
    check : function (moduleName) {
        if (this._isUpdate == true) {
            cc.log("【更新】模块{0}正在更新中".format(moduleName));
            return;
        }

        if (cc.sys.isNative) {
            this._storagePath = ((jsb.fileUtils ? jsb.fileUtils.getWritablePath() : '/') + LOCAL_STORAGE_FOLDER);

            if (jsb.fileUtils.isDirectoryExist(this._storagePath) == false) {
                jsb.fileUtils.createDirectory(this._storagePath);
            }

            cc.log("【更新】版本本地存储路径 {0}".format(this._storagePath));
        }
        else {
            this._storagePath = "";
        }

        this._nocache = game.getLocalTime(); 
        this._ad      = new AssetsDownload();

        this._moduleName     = moduleName;                                                  // 模块名
        this._moduleManifest = LOCAL_STORAGE_KEY_PROJECT      + "_" + moduleName;
        this._moduleState    = LOCAL_STORAGE_KEY_UPDATE_STATE + "_" + moduleName;  

        this._appManifest;                                                                  // 安装里的清单数据（JSON)
        this._localManifest;                                                                // 本地存储里的清单数据（JSON)
        this._remoteManifest;                                                               // 远程更新服务器的清单数据（JSON)

        this._progress = 0;                                                                 // 更新进度
        this._isUpdate = true;                                                              // 是否正在更新中

        this._loadLocalManifest(MODULE_PROJECT_MANIFEST_PATH.format(moduleName)); 
    },

    /** 开始更新版本 */
    update : function () {
        // 获取本地存储更新状态数据，如果有则继续上次的更新，无则下载远程服务器版本清单数据
        var tempManifest = cc.sys.localStorage.getItem(this._moduleState);
        if (tempManifest == null) {
            var complete = function (content) {
                // 解析远程资源清单数据
                try {
                    this._remoteManifest = JSON.parse(content);
                }
                catch(e) {
                    cc.error("【更新】远程路版本清单数据解析错误");
                }

                // 分析并下载资源
                this._downloadAssets();
            }.bind(this);

            var error = function (error) {
                cc.log("【更新】获取远程路径为 {0} 的版本清单文件失败".format(this._remoteManifest.remoteManifest));

                this._isUpdate = false;
                
                this._dispatchEvent(game.AssetEvent.REMOTE_PROJECT_MANIFEST_LOAD_FAILD); 
            }.bind(this);
            
            if (game.config.textUpdate) this._localManifest.server = game.AssetConfig.testCdn;

            var url = this._localManifest.server + game.AssetConfig.line + "/" + this._localManifest.remoteManifest;
            game.http.get(this._noCache(url), complete, error);
        }
        else {
            cc.log("【更新】获取上次没更新完的版本清单更新状态");

            this._remoteManifest = JSON.parse(tempManifest);

            // 分析并下载资源
            this._downloadAssets();
        }
    },

    /** 加载本地项目中资源清单数据 */
    _loadLocalManifest: function (appManifestPath) {
        // 加载本地项目中资源清单数据
        cc.loader.loadRes(appManifestPath, function (error, content) {
            if (error) {
                cc.log("【更新】获取游戏中路安装包中路径为 {0} 的资源清单文件失败".format(appManifestPath));
                this._dispatchEvent(game.AssetEvent.LOCAL_PROJECT_MANIFEST_LOAD_FAIL);
                return;
            }

            // 安装包中版本清单数据解析
            try {
                this._appManifest = JSON.parse(content); 
            }
            catch(e) {
                cc.error("【更新】安装包中的版本清单数据解析错误");
            }

            // 获取本地存储中版本清单数据（上次更新成功后的远程清单数据）
            var data = cc.sys.localStorage.getItem(this._moduleManifest); 
            if (data) {
                try {
                    this._localManifest = JSON.parse(data); 
                }
                catch(e) {
                    cc.error("【更新】本地版本清单数据解析错误");
                }
                
                // 安装包中的版本高于本地存储版本，则替换本地存储版本数据
                if (this._localManifest.version < this._appManifest.version){
                    // 删除本地存储中的当前模块的旧的资源
                    for (var key in this._localManifest.assets) {
                        var filePath = cc.path.join(this._storagePath, key);
                        if (jsb.fileUtils.isFileExist(filePath)){
                            jsb.fileUtils.removeFile(filePath);
                        }
                    }

                    cc.log("【更新】安装包的版本号为{0}，本地存储版本号为{1}，替换本地存储版本数据".format(this._appManifest.version, this._localManifest.version))
                    this._localManifest = this._appManifest; 
                }
            }
            else {
                cc.log("【更新】第一次安装，获取安装版中的版本清单数据");
                this._localManifest = this._appManifest; 
            }

            // 检查版本号
            this._checkVersion();
        }.bind(this));
    },

    /** 检查版本号 */
    _checkVersion: function () {
        var complete = function (content) {
            /** 远程版本数据解析 */
            try {
                var remoteVersion = JSON.parse(content);

                // 游戏中路资源版本小于远程版本时，提示有更新
                if (game.AssetConfig.debugVersion || this._localManifest.version < remoteVersion.version) {
                    cc.log("【更新】当前版本号为 {0}，服务器版本号为 {1}, 有新版本可更新".format(this._appManifest.version, remoteVersion.version));
                    this._dispatchEvent(game.AssetEvent.NEW_VERSION_FOUND);       // 触发有新版本事件
                }
                else{
                    cc.log("【更新】当前为最新版本");
                    this._isUpdate = false;
                    this._dispatchEvent(game.AssetEvent.NEW_VERSION);             // 触发已是最新版本事件
                }
            }
            catch(e) {
                cc.error("【更新】远程路版本数据解析错误");
            }
        }.bind(this);

        var error = function (error) {
            cc.log("【更新】获取远程路径为 {0} 的版本文件失败".format(this._localManifest.remoteVersion));
            this._isUpdate = false;
            this._dispatchEvent(game.AssetEvent.REMOTE_VERSION_MANIFEST_LOAD_FAILD); 
        }.bind(this);

        if (game.config.textUpdate) this._localManifest.server = game.AssetConfig.testCdn;

        // 获取远程版本数据
        var url = this._localManifest.server + game.AssetConfig.line + "/" + this._localManifest.remoteVersion;
        game.http.get(this._noCache(url), complete, error);
    },

    /** 开始下载资源 */
    _downloadAssets: function () {
        // 触发热更进度事件
        this._ad.onProgress = function(relativePath, percent){
            this._progress = percent;

            // 记录当前更新状态，更新失败时做为恢复状态使用
            this._remoteManifest.assets[relativePath].state = true;
            cc.sys.localStorage.setItem(this._moduleState, JSON.stringify(this._remoteManifest));

            this._dispatchEvent(game.AssetEvent.PROGRESS); 
        }.bind(this);

        // 触发热更完成事件
        this._ad.onComplete = function(){
            this._isUpdate = false;

            // 删除更新状态数据 
            cc.sys.localStorage.removeItem(this._moduleState);

            // 更新本地版本清单数据，用于下次更新时做版本对比
            for (var key in this._remoteManifest.assets) {
                var asset = this._remoteManifest.assets[key];
                if (asset.state) delete asset.state;
            }
            cc.sys.localStorage.setItem(this._moduleManifest, JSON.stringify(this._remoteManifest)); 

            // 触发热更完成事件
            this._dispatchEvent(game.AssetEvent.SUCCESS); 
        }.bind(this);

        // 触发热更失败事件
        this._ad.onFaild = function(){
            this._isUpdate = false;
            this._dispatchEvent(game.AssetEvent.FAILD);
        }.bind(this);

        // 触发断网事件
        this._ad.onNoNetwork = function(){
            this._isUpdate = false;
            this._dispatchEvent(game.AssetEvent.NO_NETWORK);
        }.bind(this);

        this._ad.download(this._storagePath, this._localManifest, this._remoteManifest);
    },

    /** 断网后恢复状态 */
    recovery : function(){
        this._ad.recovery();
    },

    /**
     * 触发事件
     * @param type(string)      事件类型
     * @param args(object)      事件参数
     */
    _dispatchEvent : function(type, args){
        var event           = new cc.Event.EventCustom();
        event.type          = type; 
        event.bubbles       = false;
        event.target        = this;
        event.currentTarget = this;
        this.dispatchEvent(event); 
    },

    /** 规避 HTTP 缓存问题 */
    _noCache: function (url) {
        return url + "?t=" + this._nocache;
    }
})

/** 验证是否有覆盖安装，安装包中版本高于本地资源时，删除本地资源的模块资源 */
AssetsManager.check = function(remoteVersion){
    var moduleTotal   = 0;
    var moduleCurrent = 0;

    // 加载安装包中的版本清单文件
    var loadAppManifest = function(moduleName, modules, versions, remoteVersion){
        var appManifestPath = MODULE_PROJECT_MANIFEST_PATH.format(moduleName);
        cc.loader.loadRes(appManifestPath, function (error, content) { 
            if (error) {
                cc.error("【更新】验证是否有覆盖安装时，获取游戏中路安装包中路径为 {0} 的资源清单文件失败".format(appManifestPath));
                return;
            }
    
            var storagePath = ((jsb.fileUtils ? jsb.fileUtils.getWritablePath() : '/') + LOCAL_STORAGE_FOLDER);
            var appManifest = JSON.parse(content); 
            var appVersion  = appManifest.version;

            // 获取本地版本清单信息
            var moduleManifest = LOCAL_STORAGE_KEY_PROJECT + "_" + moduleName;
            var manifest       = cc.sys.localStorage.getItem(moduleManifest); 
            if (manifest) {
                var localManifest = JSON.parse(manifest); 
                var localVersion  = localManifest.version;

                // 安装包中的版本高于本地存储版本，则替换本地存储版本数据
                if (localVersion < appVersion){ 
                    // 删除本地存储中的当前模块的旧的资源
                    for (var key in localManifest.assets) {
                        var filePath = cc.path.join(storagePath, key);
                        if (jsb.fileUtils.isFileExist(filePath)){
                            jsb.fileUtils.removeFile(filePath);  
                        } 
                    }

                    versions[moduleName] = appVersion;                             // 有本地清单数据时，当前版本号为安装包版本号
                    modules[moduleName]  = modules[moduleName] > appVersion;       // 有本地清单数据时，安卓包版本号小于远程版本号
                }
                else{
                    versions[moduleName] = localVersion;                           // 有本地清单数据时，当前版本号为本地版本号
                    modules[moduleName]  = modules[moduleName] > localVersion;     // 有本地清单数据时，本地清单版本号小于远程版本号
                }
            }
            else{
                versions[moduleName] = appVersion;                                 // 没有本地清单数据时，当前版本号为安装包版本号
                modules[moduleName]  = modules[moduleName] > appVersion;           // 没有本地清单数据时，安卓包版本号小于远程版本号
            }

            moduleCurrent++;

            if (moduleCurrent == moduleTotal){
                if (remoteVersion) remoteVersion(modules, versions);
            }
        });
    }

    // 游戏所有模块的配置文件
    var url = ""; 

    if (game.config.useSSL){
        url = "https://{0}:3001/constinfo/version?t={1}".format(game.config.gateSocketIp, game.getLocalTime());
    }
    else{
        url = "http://{0}:3001/constinfo/version?t={1}".format(game.config.gateSocketIp, game.getLocalTime());
    }

    if (game.config.textUpdate) url = "http://{0}:3001/constinfo/version.json?t={1}".format(game.AssetConfig.testIp, game.getLocalTime());

    // 加载游戏模块当前最前版本号数据
    game.http.get(url, function(version_json){
        var json     = JSON.parse(version_json);
        var modules  = json.modules;
        var versions = {};
        game.AssetConfig.line = json.line;

        // 计算游戏共有多少个模块
        for(var moduleName in modules){
            moduleTotal++;
        }

        // 载入游戏所有安装包中的模块版本数据
        for(var moduleName in modules){
            loadAppManifest(moduleName, modules, versions, remoteVersion);
        }
    }.bind(this));
}

/** 
 * 删除模块 
 * @param moduleName(string)    模块名
 */
AssetsManager.delete = function(moduleName){
    var storagePath = ((jsb.fileUtils ? jsb.fileUtils.getWritablePath() : '/') + LOCAL_STORAGE_FOLDER);
    var data        = cc.sys.localStorage.getItem(LOCAL_STORAGE_KEY_PROJECT + "_" + moduleName);
    if (data) {
        try {
            var localManifest = JSON.parse(data); 

            for (var key in localManifest.assets) {
                var filePath = cc.path.join(storagePath, key);
                if (jsb.fileUtils.isFileExist(filePath)){
                    jsb.fileUtils.removeFile(filePath);
                }
            }
        }
        catch(e) {
            cc.error("【更新】删除模块时,本地版本清单数据解析错误");
        }

        cc.sys.localStorage.removeItem(LOCAL_STORAGE_KEY_PROJECT      + "_" + moduleName);
        cc.sys.localStorage.removeItem(LOCAL_STORAGE_KEY_UPDATE_STATE + "_" + moduleName);
    }
}

game.asset = module.exports = AssetsManager;
