var resource  = require('resource'),
    admin = resource.define('admin');

resource.use('system');
resource.use('view');
resource.use('datasource');

admin.method('start', start);

function start (options, callback) {
  var connect = require('connect');
  var auth = connect.basicAuth('admin', 'admin');

  resource.http.app.use(connect.static(__dirname + '/public'));

  var view = resource.view.create({ path: __dirname + '/view'});
  view.load();

  resource.http.app.get('/admin', auth, function (req, res, next) {
    var _r = _resources();
    var str = view.index.render({
      system: JSON.stringify(dashboard(), true, 2)
    });
    res.end(str);
  });

  resource.http.app.get('/admin/resources', auth, function (req, res, next) {
    var str = view.resources.render({ resources: JSON.stringify(_resources(), true, 2) });
    res.end(str);
  });

  resource.http.app.get('/admin/resources/:resource', auth, function (req, res, next) {
    var r = resource.resources[req.param('resource')];
    var obj = resource.toJSON(r);
    var str = view.resource.render({
      name: r.name,
      schema: JSON.stringify(r.schema, true, 2),
      methods: JSON.stringify(_methods(r), true, 2)
    });
    res.end(str);
  });

  resource.http.app.get('/admin/resources/:resource/:method', auth, function (req, res, next) {
    var _resource = resource.resources[req.param('resource')];
    var _method = _resource[req.param('method')];
    var str = view.method.render({
      method: _method.unwrapped.toString()
    });
    res.end(str);
  });

}

exports.admin = admin;

exports.dependencies = {
  "connect": "*"
};

//
// TODO: move this out of here to resource.toJSON
//
  function _resources () {
    var arr = [];
    Object.keys(resource.resources).forEach(function(r){
      arr.push(r);
    });
    return arr;
  }
  function _methods (resource) {
    var arr = [];
    Object.keys(resource.methods).forEach(function(m){
      arr.push(m);
    });
    return arr;
  }
//
//
//


// generates JSON-data to be sent to dashboard view
function dashboard () {

  var os  = require('os'),
      obj = {};

  obj.name     = "big";
  obj.version  = "v0.0.0";

  obj.system = resource.system.info();

  obj.resources = [];

  for(var r in resource.resources) {
    obj.resources.push(r);
  }

  return obj;

};