//
// resource.js - resource module for node.js
//

//
// Create a resource singleton
//
var resource = {};

//
// Require a simple JSON-Schema validator
//
var validator = require('./validator');

//
// On the resource, create a "resources" object that will store a reference to every defined resource
//
resource.resources = {};

//
// Use a resource by string name
//
resource.use = function (r, options) {

  var self = this;

  //
  // Load the resource as a node.js module
  //
  var _r = resource.load(r);

  //
  // If the required resource doesn't have the expected exported scope,
  // throw a friendly error message
  //
  if(typeof _r[r] === 'undefined') {
    throw new Error("exports." + r + " is not defined in the " + r + ' resource!')
  }

  //
  // TODO: do we need this?
  //
      this[r] = _r[r];
      this[r].name = r;

      //
      // hoist up any resource methods which are considered special,
      // ex: "start", "listen", "connect"
      //
      hoistMethods(this[r], self);

  //
  // Any options passed into resource.use('foo', options),
  // will be considered configuration options, and bound to resource.config
  //
  this[r].config = options || {};

  //
  // Attach a copy of the resource to the resource module scope for later reference
  //
  resource.resources[r] = this[r];

  //
  // If a database configuration has been specified, attach CRUD methods to resource.
  // This adds methods such as Resource.create / Resource.get.
  // With a datasource specification, resources can persist.
  // Persisting resources requires an additional dependency of "jugglingdb"
  // see: github.com/1602/jugglingdb
  //
  if (typeof this[r].config.datasource !== 'undefined') {
    crud(this[r], this[r].config.datasource);
  }

  return this[r];

};

//
// Load a resource module by string name
//
resource.load = function (r, callback) {
  //
  // TODO: clean up nested try / catch
  //
  var result;
  try {
    //
    // First, attempt to load resource as absolute path name
    //
    result = require(__dirname + '/../resources/' + r);
  } catch (err) {
    throw err;
    try {
      //
      // Altenatively, attempt to load resource as straight npm package name
      //
      result = require(r);
    } catch (err) {
      result = err;
    }
  }
  return result;
};

//
// Will eventually be renamed and replace resource.define
//
resource.define = function (name, schema, data) {

  //
  // Create an empty resource object
  //
  var r = {};

  //
  // Initalize the resource with default values
  //
  r.name = name;
  r.methods = {};
  r.schema = {
    properties: {
      "id": {
        "type": "any"
      }
    }
  };
  r.config = {};

  //
  // Give the resource a property() method for defining properties
  //
  r.property = function (name, schema) {
    addProperty(r, name, schema);
  };

  //
  // Give the resource a method() method for defining methods
  //
  r.method = function (name, method, schema) {
    addMethod(r, name, method, schema);
  };

  //
  // TODO: Create a new object based on the schema
  //
  
  //
  // TODO: If any additional data has been passed in, assign it to the resource
  //

  //
  // Attach a copy of the resource to the resources scope ( for later reference )
  //
  resource.resources[name] = r

  //
  // Return the new resource
  //
  return r;

};

//
// Provider API mapping for JugglingDB to datasource API for convenience
//
var mappings = {
  "couch": "cradle",
  "couchdb": "cradle"
};


//
// Creates a new instance of a schema based on default data as arguments array
//
var instantiate = resource.instantiate = function (schema, levelData) {
  var obj = {};

  levelData = levelData || {};

  if(typeof schema.properties === 'undefined') {
    return obj;
  }

  Object.keys(schema.properties).forEach(function(prop, i){

    if (typeof schema.properties[prop].default !== 'undefined') {
      obj[prop] = schema.properties[prop].default;
    }

    if (typeof levelData[prop] !== 'undefined') {
      obj[prop] = levelData[prop];
    }

    if (typeof schema.properties[prop].properties === 'object') {
      obj[prop] = instantiate(schema.properties[prop], levelData[prop]);
    }

  });

  return obj;
}

//
// Extends a resource with CRUD methods.
// This reates model to back resource, and allows the resource to be instantiable
//
function crud (r, options) {

  if(typeof options === "string") {
    options = {
      type: options
    };
  }

  //
  // Require JugglingDB.Schema
  //
  var Schema = require('jugglingdb').Schema;

  //
  // Create new JugglingDB schema, based on incoming datasource type
  //
  var _type = mappings[options.type] || options.type || 'fs';
  var schema = new Schema(_type, {
    database: "big",
    host: options.host,
    port: options.port,
    username: options.username,
    password: options.password,
    https: true // TODO: check that HTTPS actually does something
  });

  //
  // Create empty schema object for mapping between resource and JugglingDB
  //
  var _schema = {};

  //
  // For every property in the resource schema, map the property to JugglingDB
  //
  Object.keys(r.schema.properties).forEach(function(p){
    var prop = resource.schema.properties[p];
    //
    // TODO: Better type detection
    //
    _schema[p] = { type: String }; // TODO: not everything is a string
  });

  //
  // Create a new JugglingDB schema based on temp schema
  //
  var Model = schema.define(r.name, _schema);

  // TODO: map all JugglingDB crud methods
  // TODO: create before / after hook methods
  // TOOD: map resource methods back onto returned JugglingDB models scoped with primary key ( for convience )

  //
  // Attach the CRUD methods to the resource
  //

  //
  // CREATE method
  //
  function create (data, callback) {
    Model.create(data, callback);
  }
  r.method('create', create, {
    "description": "create a new " + r.name,
    "properties": {
      "options": {
        "type": "object",
        "properties": r.schema.properties
      },
      "callback": {
        "type": "function"
      }
    }
  });

  //
  // Get method
  //
  function get (id, callback){
    Model.find(id, callback);
  }
  r.method('get', get, {
    "description": "get " + r.name +  " by id",
    "properties": {
      "id": {
        "type": "any",
        "description": "the id of the object",
        "required": true
      },
      "callback": {
        "type": "function"
      }
    }
  });

  //
  // Find method
  //
  function find (options, callback){
    Model.all(options, callback);
  }
  r.method('find', find, {
    "description": "find all instances of " + r.name +  " that matches query",
    "properties": {
      "options": {
        "type": "object",
        "properties": r.schema.properties
      },
      "callback": {
        "type": "function"
      }
    }
  });

  //
  // All method
  //
  function all (callback){
    Model.all({}, callback);
  }

  r.method('all', all, {
    "description": "find all instances of " + r.name,
    "properties": {
      "callback": {
        "type": "function"
      }
    }
  });

  //
  // Save method
  //
  function save (options, callback){
    Model.save(options, callback);
  }
  r.method('save', save, {
    "description": "saves " + r.name + " instance. if no id is provided, create is called instead.",
    "properties": {
      "options": {
        "type": "object",
        "properties": r.schema.properties
      },
      "callback": {
        "type": "function"
      }
    }
  });

  //
  // Destroy method
  //
  function destroy (id, callback){
    Model.destroy(options, callback);
  }
  r.method('destroy', find, {
    "description": "destroys a " + r.name + " by id",
    "properties": {
      "id": {
        "type": "any",
        "description": "the id of the object",
        "required": true
      },
      "callback": {
        "type": "function"
      }
    }
  });

  // assign model to resource
  r.model = Model;
}


//
// Attachs a method onto a resources as a named function with optional schema and tap
//
function addMethod (r, name, method, schema, tap) {

  //
  // Create a new method that will act as a wrap for the passed in "method"
  //
  var fn = function () {

    var args  = Array.prototype.slice.call(arguments),
        _args = [];

    var payload = [],
        callback = args[args.length -1];

    //
    // Inside this method, we must take into account any schema,
    // which has been defined with the method signature and validate against it
    //
    if (typeof schema === 'object') {

      //
      // First, create a new schema instance of the object based on the current schema and data
      //
      var defaults = {}, _data = {};

      if (typeof schema.properties === "object") {
        Object.keys(schema.properties).forEach(function(prop,i){
          _data[prop] = args[i]
        });
      }

      defaults = resource.instantiate(schema, _data);

      //
      // Perform a schema validation
      //
      var validate = validator.validate(defaults, schema);

      //
      // If the schema check fails, do not fire the wrapped method.
      //
      if (!validate.valid) {
        if (typeof callback === 'function') {
          //
          // If a valid callback was provided, continue with the error
          //
          return callback(validate.errors);
        } else {
          //
          // If there is no valid callback, throw an error ( for now )
          //
          throw new Error(validate.errors);
        }
      }

      //
      // Mixin default schema data with supplied function arguments
      //
      Object.keys(defaults).forEach(function(item){
        _args.push(defaults[item]);
      });

      //
      // Check to see if the last supplied argument was a function.
      // If so, it is assumed the method signature follows the node.js,
      // convention of the last argument being a callback
      //
      if(typeof callback === 'function') {
        _args.push(callback);
      }

    } else {
      _args = args;
    }

    //
    // Everything seems okay, excecute the method with passed in arguments
    //
    return method.apply(this, _args);
  };

  // store the schema on the fn for later reference
  fn.schema = schema;

  //
  // The method is bound onto the "methods" property of the resource
  //
  r.methods[name] = fn;

  //
  // The method is also bound directly onto the resource
  //
  // TODO: add warning / check for override
  r[name] = fn;
}

function addProperty (r, name, schema) {
  r.schema.properties[name] = schema;
}

//
// Aggregates and hoists any "special" defined methods, such as "start", "listen", "connect", etc...
//
function hoistMethods (r, self) {
  //
  // Check for special methods to get hoisted onto big
  //
  var hoist = ['start', 'connect', 'listen']; // TODO: un-hardcode configurable hoist methods
  for (var m in r.methods) {
    if (typeof r.methods[m] === 'function' && hoist.indexOf(m) !== -1) {

      function queue (m) {
        if(typeof self['_' + m] === "undefined") {
          self['_' + m] = [];
          self[m] = function (options, callback) {
            // TODO: async iterator
            // TODO: un-hardcode options/callback signature
            self['_' + m].forEach(function(fn){
              if(typeof options === "function") { // no options sent, just callback
                callback = options;
                options = {};
              }
              fn(options, callback);
            });
          };
        }
        self['_' + m].push(r.methods[m]);
      }
      queue(m);
    }
  }
}


//
// Creates a "safe" non-circular JSON object for easy stringification purposes
//
resource.toJSON = function (r) {
  var obj = {};
  var obj = {
    name: r.name,
    schema: r.schema,
    methods: methods(r)
  }
  function methods (r) {
    var obj = {};
    for(var m in r.methods) {
      obj[m] = r.methods[m].schema
    }
    return obj;
  }
  return obj;
};

resource.schema = {
  properties: {}
};

resource.methods = [];
resource.name = "resource";


// TODO: add check for exports.dependencies requirements
module['exports'] = resource;