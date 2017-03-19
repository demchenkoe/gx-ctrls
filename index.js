/**
 * Autor Eugene Demchenko <demchenkoev@gmail.com>
 * Created on 11.03.17.
 * License BSD
 */
'use strict';

let defaultOptions = {
  validatorFormat: 'errorFormater',
  defaultRole: 'UNAUTHORIZED',
  errorFormater: function (errorHash, message, details) {
    let error = {code: errorHash};
    if (message) {
      error.message = message;
    }
    if (details) {
      error.details = details;
    }
    return {error: error};
  },

  pickRoleFromContext: function (context) {
    if (!context) {
      return defaultOptions.defaultRole;
    }
    if (context.role) {
      return context.role;
    }
    let user = context.user || null;
    return user && user.role ? user.role : defaultOptions.defaultRole;
  }

};


let validate = require("validate.js");
let Acl = require("virgen-acl").Acl;
let _ = require('lodash');

validate.formatters.errorFormater = function (errors) {
  if (!errors.length) {
    return null;
  }
  let details = {};
  errors.forEach(function (error) {
    details[error.attribute] = error.error;
  });
  return defaultOptions.errorFormater("INVALID_PARAMS", "Please send valid parameters.", details);
};


class Abstract {

  constructor(options) {
    this.options = options;
  }

  set options(options) {
    if(!this._options) {
      this._options = Object.assign({},  defaultOptions, options);
    } else {
      Object.assign(this._options, options);
    }
  }

  get options() {
    if(!this._options) {
      this.options = {};
    }
    return this._options;
  }

  set context(ctx) {
    this._context = ctx || {};
  }

  get context() {
    return this._context || (this._context= {});
  }

  set acl(acl) {
    this.options.acl = acl;
  }

  pickRoleFromContext(context) {
    return this.options.pickRoleFromContext(context || this.context);
  }

  checkAccess(context) {
    if (!this.options.acl || !context.$command || context.$command.isAllowed) {
      return Promise.resolve(context.$command);
    }
    return new Promise((resolve, reject) => {

      let role = this.pickRoleFromContext(context || this.context);
      let resource = context.$command.controllerName;
      let action = context.$command.actionName;
      if(this.options.checkAccessOnAliases && context.$command.aliasName) {
        let parts = context.$command.aliasName.split('.');
        resource = parts[0];
        action = parts[1];
      }
      this.options.acl.query(
        role,
        resource,
        action,
        (err, allowed) => {
          
          if (err) {
            return reject(err);
          }
          context.$command.isAllowed = allowed;

          if (!allowed) {
            return reject(
              this.options.errorFormater('ACCESS_DENIED', `This action not allowed for role "${role}".`, context.$command)
            );
          } else {
            return resolve(context.$command);
          }
        });
    });
  }

  //Hide fields by rules

  filterFields(obj, rule) {
    let restricted = rule.restricted;
    for(var i=0; i < restricted.length; i++) {
      var pathParts = restricted[i].toString().split('.');
      var field = pathParts.pop();
      var deepObj = pathParts.length ? _.get(obj, pathParts) : obj;
      if (deepObj) {
        delete deepObj[field];
      }
    }
    return obj;
  }

  getFieldsRule(role) {
    if(!this.fieldsRules) {
      return null;
    }
    return _.find(this.fieldsRules, (rule) => {
      return Array.isArray(rule.roles) ?  rule.roles.indexOf(role) >= 0 : rule.roles === role;
    });
  }

  applyFieldsRule(obj, roleOrConext) {
    let role;
    if(typeof roleOrConext === 'string') {
      role = roleOrConext;
    } else {
      role = this.pickRoleFromContext(roleOrConext || this.context);
    }
    if(!role) {
      return obj;
    }

    let rule = this.getFieldsRule(role);
    if(!rule) {
      return obj;
    }

    if(Array.isArray(obj) ) {
      return _.map(obj, (obj) => {
        return this.filterFields(obj, rule);
      });
    } else {
      return this.filterFields(obj, rule);
    }
  }
  /* Example, for rule

  get fieldsRules() {
    return [
      { roles: ['guest'], restricted: ["deletedAt", "password", "salt"] }
    ]
  }
  */

}

class Action extends Abstract {

  constructor(actionName, options) {
    if(typeof actionName !== 'string') {
      options = actionName;
      actionName = null;
    }
    super(options);
    this.actionName = actionName || this.constructor.name;
  }
  
  set params(params) {
    this._params = params;
  }
  get params() {
    return this._params || (this._params = {});
  }

  set command(command) {
    this._command = Object.assign({}, command, { action: this, actionName: this.actionName });
  }

  get command() {
    if(!this._command) {
      this.command = {};
    }
    return this._command;
  }

  validateParams() {
    if (!this.paramsConstraints) {
      return Promise.resolve(true)
    }
    return validate.async(this.params, this.paramsConstraints, {format: this.options.validatorFormat});
  }

  before() {
    return Promise.resolve(true);
  }

  process() {
    return Promise.resolve(true);
  }

  after(result) {
    return Promise.resolve(result);
  }

  execute(context, params, options) {
    this.params = params;
    this.context = context;
    this.command = this.context.$command || {};
    if (options) {
      this.options = options;
    }
   
    return this.before()
      .then(() => {
        return this.validateParams();
      })
      .then(() => {
        return this.checkAccess(this.context);
      })
      .then(() => {
        return this.process(this.command);
      })
      .then((result) => {
        return this.after(result);
      });
  }
}

class Contoller extends Abstract {

  constructor(controllerName, options) {
    if(typeof controllerName !== 'string') {
      options = controllerName;
      controllerName = null;
    }
    super(options);
    this._controllerName = controllerName || this.constructor.name;
    this._actions = {};
  }

  addAction(actionName, actionClass) {
    this._actions[actionName] = actionClass;
  }

  get actions() {
    return this._actions;
  }

  getActionClass(actionName) {
    let actions = this.actions;
    if (!actions || !this.actions.hasOwnProperty(actionName)) {
      return Promise.reject(
        defaultOptions.errorFormater('INVALID_ACTION_NAME', `Action ${actionName} not found.`, {actionName: actionName})
      );
    }
    let actionClass = this.actions[actionName];
    return Promise.resolve(actionClass);
  }

  getActionInstance(actionName, context, options) {
    return this.getActionClass(actionName)
      .then((ActionClass) => {
        context || (context = {});
        context.$command || (context.$command = {});
        context.$command.controllerName = this._controllerName;
        context.$command.controller = this;
        context.$command.actionClass = ActionClass;
        var action = context.$command.action = new ActionClass(actionName, Object.assign({}, this.options, options) );
        return Promise.resolve(action);
      });
  }

  before(action) {
    return Promise.resolve(action);
  }

  process(context, action, params, options) {
    return action.execute(context, params, options);
  }

  after(result) {
    return Promise.resolve(result);
  }

  execute(context, actionName, params, options) {
    let action;
    return this.getActionInstance(actionName, context, options)
      .then(this.before.bind(this))
      .then((_action) => {
        action = _action;
        return this.checkAccess(context);
      })
      .then(() => {
        return this.process(context, action, params, options);
      })
      .then(this.after.bind(this));
  }
}

class Dispatcher extends Abstract {

  constructor(dispatcherName, options) {
    if(typeof dispatcherName !== 'string') {
      options = dispatcherName;
      dispatcherName = null;
    }
    super(options);
    this._dispatcherName = dispatcherName || this.constructor.name;
    this._controllers = {};
    this._aliases = {};
  }

  addController(name, controllerClass) {
    if(name instanceof Contoller) {
      controllerClass = name;
      name = controllerClass.constructor.name;
      this._controllers[name] = controllerClass;
    }
    else if(Array.isArray(name)) {
      name.forEach((v) => {
        this.addController(v);
      });
    }
    else
    if(typeof name === 'object') {
      let controllers = name;
      for(var k in controllers) {
        if(!controllers.hasOwnProperty(k)) continue;
        this._controllers[k] = controllers[k];
      }
    } else {
      this._controllers[name] = controllerClass;
    }
  }

  parseCommandName(command) {
    if (typeof command !== 'string') {
      return Promise.reject(this.options.errorFormater('INVALID_COMMAND_NAME', 'Argument "command" must be a string.'));
    }
    let parts = command.split('.');
    if (parts.length < 2) {
      return Promise.reject(this.options.errorFormater('INVALID_COMMAND_NAME', 'Command name must be a string in format <controller>.<action>.'));
    }
    let $command = {
      command: command,
      controllerName: parts[0],
      actionName: parts[1],
      dispatcher: this
    };
    if (!this._controllers.hasOwnProperty($command.controllerName)) {
      return Promise.reject(this.options.errorFormater('INVALID_COMMAND_NAME', `Not found handler for command ${$command.command}`, $command));
    }
    $command.controllerClass = this._controllers[$command.controllerName];

    return Promise.resolve($command);
  }

  addAlias(name, options) {
    if (typeof options === 'string') {
      options = {command: options};
    }
    this._aliases[name] = Object.assign({}, options);
  }

  handleAlias(context, alias, params, options) {
    let aliasOptions = this._aliases[alias];
    return this.parseCommandName(aliasOptions.command)
      .then(($command) => {
        $command.aliasName = alias;
        $command.aliasOptions = aliasOptions;
        return Promise.resolve($command);
      });
  }

  execute(context, command, params, options) {

    let executor = ($command) => {
      options || (options = {});
      context = Object.assign({}, context);
      context.$command = $command;
      var controller = context.$command.controller = new $command.controllerClass(options);
      return controller.execute(context, $command.actionName , params, options);
    };

    if (this._aliases.hasOwnProperty(command)) {
      return this.handleAlias(context, command, params, options).then(executor)
    }

    return this.parseCommandName(command, context, params, options).then(executor);
  }

  executeBulk(context, commands, options) {

    let executor = (command, params, options) => {
      return new Promise((resolve, reject) => {
        context = context || {};
        context.$isBulk = true;
        this.execute(context, command, params, options).then(resolve, resolve);
      });
    };

    let promises = [];

    commands.forEach(function (cmd) {
      promises.push(executor(cmd.command, cmd.params, Object.assign({}, options, cmd.options)));
    });

    return Promise.all(promises);
  }
}

module.exports.defaultOptions = defaultOptions;
module.exports.validate = validate;
module.exports.Acl = Acl;
module.exports.Abstract = Abstract;
module.exports.Action = Action;
module.exports.Contoller = Contoller;
module.exports.Dispatcher = Dispatcher;
