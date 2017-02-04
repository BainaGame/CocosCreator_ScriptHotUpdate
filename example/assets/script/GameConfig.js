/**
 * 全局环境设置
 * Author      : donggang
 * Create Time : 2016.7.26
 */
/** 外网测试服 */
var debug_extranet = {
    gateSocketIp    : "192.168.1.1",                    // 网关地址
    gateSocketPort  : 3101,                             // 网关端口

    useSSL          : false,                            // 是否使用https
    textUpdate      : true,                             // 是否开启测试热更新
}; 

window.game = window.game || {};
game.config = module.exports = debug_extranet; 

require("HttpRequest");
