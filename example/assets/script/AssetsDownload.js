/** 
 * 队列加载资源
 * Author      : donggang
 * Create Time : 2016.12.15
 * 
 * 事件：
 * this.onProgress      更新进度
 * this.onNoNetwork     断网
 * this.onComplete      更新完成
 */

module.exports = cc.Class({
    /** 分析并获取需要更新的资源 */
    download: function (storagePath, localManifest, remoteManifest) {
        this._storagePath       = storagePath;
        this._localManifest     = localManifest; 
        this._remoteManifest    = remoteManifest;

        this._nocache           = (new Date()).getTime();

        this._downloadUnits     = [];        // 下载文件对象集合
        this._completeUnits     = [];        // 已下载完成对象集合
        this._failedUnits       = [];        // 下载失败文件对象集合
        this._deleteUnits       = [];        // 需要删除文件对象集合

        this._downloadComplete  = 0;         // 下载完成的文件数量
        this._downloadFailed    = 0;         // 下载失败的文件数量
        this._failCount         = 0;         // 下载失败的次数
        this._concurrentCurrent = 0;         // 并发数量当前值

        this._analysisDownloadUnits();
        this._analysisDeleteUnits();

        // 当前总更新单位数量 = 更新完成文件数量 + 待更新文件数量
        this._totalUnits = this._downloadComplete + this._downloadUnits.length;

        cc.log("【更新】共有{0}个文件需要更新".format(this._downloadUnits.length));
        cc.log("【更新】共有{0}个文件需要删除".format(this._deleteUnits.length));

        this._items = this._downloadUnits.slice(0);

        if (this._items.length > 0){
            this._downloadAsset();
        }
        else{
            cc.log("【更新】无更新文件，更新完成");
            if (this.onComplete) this.onComplete(); 
        }
    },

    /** 对比本地项目清单数据和服务器清单数据，找出本地缺少的以及和服务器不一样的资源 */
    _analysisDownloadUnits : function(){
        for (var key in this._remoteManifest.assets) {
            if (this._localManifest.assets.hasOwnProperty(key)) {
                if (game.AssetConfig.debugRes || this._remoteManifest.assets[key].md5 != this._localManifest.assets[key].md5) {
                    // cc.log("【更新】准备下载更新的资源 {0}".format(key));
                    this._addDownloadUnits(key); 
                }
            } 
            else {
                // cc.log("【更新】准备下载本是不存在的资源 {0}".format(key));
                this._addDownloadUnits(key);
            }
        }
    },

    /** 对比本地项目清单数据和服务器清单数据，找出本地多出的资源 */
    _analysisDeleteUnits : function(){
         for (var key in this._localManifest.assets) {
            if (this._remoteManifest.assets.hasOwnProperty(key) == false) {
                // cc.log("【更新】准备删除的资源{0}".format(key)); 
                this._deleteUnits.push(key);
            }
        }
    },

    /** 添加下载单位 */
    _addDownloadUnits : function(key){
        if (this._remoteManifest.assets[key].state != true){
            this._downloadUnits.push(key);                             // 远程版本的文件 MD5 值和本地不同时文件需要下载
        }
        else {
            this._downloadComplete++;                                  // 恢复状态时的下载完成数量
        }
    },

    /** 断网后恢复更新状态 */
    recovery : function(){
        this._downloadAsset();
    },

    /** 下载资源 */
    _downloadAsset : function(){
        if (game.config.textUpdate) this._remoteManifest.server = game.AssetConfig.testCdn;

        var relativePath = this._items.shift();
        var url          = cc.path.join(this._remoteManifest.server, game.AssetConfig.line, relativePath); 
        
        // 下载成功
        var complete = function (asset) {
            // 文件保存到本地
            this._saveAsset(relativePath, asset);

            // 记录更新完成的文件
            this._completeUnits.push(relativePath);

            // 下载完成的文件数量加 1
            this._downloadComplete++;

            if (game.AssetConfig.debugProgress)
                cc.log("【更新】进度 {0}/{1}，当前有 {2} 个资源并行下载".format(this._downloadComplete, this._totalUnits, this._concurrentCurrent)); 

            // 还原并发数量
            this._concurrentCurrent--;
                        
            // 更新进度事件
            if (this.onProgress) {
                this.onProgress(relativePath, this._downloadComplete / this._totalUnits);
            }

            // 判断是否下载完成
            this._isUpdateCompleted();  
        }.bind(this);

        // 下载失败
        var error = function (error) {
            this._failedUnits.push(relativePath);
            this._concurrentCurrent--;
            this._downloadFailed++;

            if (game.HttpEvent.NO_NETWORK){                         // 触发断网事件
                if (this._concurrentCurrent == 0){
                    if (this.onNoNetwork) this.onNoNetwork();
                }
            }
            else {
                cc.log("【更新】下载远程路径为 {0} 的文件失败，错误码为 {1}".format(url, error));
                cc.log("【更新】进度 {0}/{1}, 总处理文件数据为 {2}".format(this._downloadComplete, this._totalUnits, this._downloadComplete + this._downloadFailed));

                this._isUpdateCompleted();
            }
        }.bind(this);        
        
        game.http.getByArraybuffer(this._noCache(url), complete, error);

        // 开启一个并行下载队列
        this._concurrentCurrent++;
        if (this._concurrentCurrent < game.AssetConfig.concurrent){
            this._downloadAsset();
        }
    },

    /** 下载失败的资源 */
    _downloadFailedAssets: function () {
        // 下载失败的文件数量重置
        this._downloadFailed = 0;
        this._downloadUnits  = this._failedUnits;
        this._failedUnits    = [];
        this._items          = this._downloadUnits.slice(0);

        if (this._items.length > 0){
            this._downloadAsset();
        }
    },

    /** 判断是否全部更新完成 */
    _isUpdateCompleted: function () {
        var handleCount = this._downloadComplete + this._downloadFailed;                    // 处理完成数量
        
        if (this._totalUnits == this._downloadComplete) {                                   // 全下载完成
            cc.log("【更新】更新完成");

            // 触发热更完成事件
            if (this.onComplete) this.onComplete();

            // 删除本地比服务器多出的文件
            this._deleteAssets();
        }
        else if (this._totalUnits == handleCount) {                                         // 全处理完成，有下载失败的文件，需要重试
            cc.log("【更新】下载文件总数量　　：", this._totalUnits);
            cc.log("【更新】下载成功的文件数量：", this._downloadComplete);
            cc.log("【更新】下载失败的文件数量：", this._downloadFailed);

            // 更新失败的次数加 1
            this._failCount++;

            if (this._failCount < 3) { 
                cc.log("【更新】更新重试第 {0} 次".format(this._failCount));

                this._downloadFailedAssets();
            }
            else {
                cc.log("【更新】更新失败");

                // 触发热更失败事件
                if (this.onFaild) this.onFaild();
            }
        }
        else if (this._items.length > 0 && this._concurrentCurrent < game.AssetConfig.concurrent) {      // 队列下载
            this._downloadAsset();    
        }
    },

    /** 删除本地比服务器多出的文件 */
    _deleteAssets: function () {
        for (var i = 0; i < this._deleteUnits.length; i++) {
            var relativePath = this._deleteUnits[i];
            var filePath     = cc.path.join(this._storagePath, relativePath);
            if (jsb.fileUtils.removeFile(filePath)) {
                cc.log("【更新】版本多余资源 {0} 删除成功".format(filePath));
            } 
            else {
                cc.log("【更新】版本多余资源 {0} 删除失败".format(filePath));
            };
        }
    },

    /** 文件保存到本地 */
    _saveAsset : function(relativePath, asset){
        if (cc.sys.isNative){
            var storeDirectory = cc.path.join(this._storagePath, relativePath.substr(0, relativePath.lastIndexOf("/")));
            var storePath      = cc.path.join(this._storagePath, relativePath);

            // 存储目录
            if (jsb.fileUtils.isDirectoryExist(storeDirectory) == false) {
                jsb.fileUtils.createDirectory(storeDirectory);
            }

            // 存储文件
            jsb.fileUtils.writeDataToFile(new Uint8Array(asset), storePath);
        }
    },

    /** 规避 HTTP 缓存问题 */
    _noCache: function (url) {
        return url + "?t=" + this._nocache;
    }
})