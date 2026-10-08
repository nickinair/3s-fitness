const config = require('../../config');

Page({
  data: { url: config.H5_URL },
  onLoad(options) {
    // 支持通过小程序码参数直达某页, 如 scene=checkin -> /m/#/checkin
    let url = config.H5_URL;
    if (options && options.path) url += '#/' + decodeURIComponent(options.path);
    this.setData({ url });
  },
});
