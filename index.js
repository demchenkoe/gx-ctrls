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
  }
};


let validate = require("validate.js");

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

class Action {
  constructor(context, params, options) {
    this.context = context || {};
    this.params = params || {};
    this.options = Object.assign({}, defaultOptions, options);
  }

  validateParams() {
    if (!this.paramsConstraints) {
      return Promise.resolve(true)
    }
    return validate.async(this.params, this.paramsConstraints, {format: this.options.validatorFormat});
  }

  pickRoleFromContext() {
    if (this.context.role) {
      return this.context.role;
    }
    let user = this.context.user || null;
    return user && user.role ? user.role : this.options.defaultRole;
  }

  checkAcckess() {
    let allowRoles, denyRoles;
    let ctrl = this.options.ctrl;

    if (Array.isArray(this.options.allowRoles)) {
      allowRoles = this.options.allowRoles;
    } else if (Array.isArray(this.allowRoles)) {
      allowRoles = this.allowRoles;
    } else if (ctrl && Array.isArray(ctrl.allowRoles)) {
      allowRoles = ctrl.allowRoles;
    }

    if (Array.isArray(this.options.denyRoles)) {
      denyRoles = this.options.denyRoles;
    } else if (Array.isArray(this.denyRoles)) {
      denyRoles = this.denyRoles;
    } else if (ctrl && Array.isArray(ctrl.denyRoles)) {
      denyRoles = ctrl.denyRoles;
    }

    if (!Array.isArray(allowRoles) && !Array.isArray(denyRoles)) {
      return Promise.resolve(true);
    }

    let currentRole = this.pickRoleFromContext();

    if (Array.isArray(allowRoles)) {
      if (allowRoles.indexOf(currentRole) !== -1) {
        return Promise.resolve(true);
      } else {

        return Promise.reject(
          defaultOptions.errorFormater('ACCESS_DENIED', `This action not allowed for role ${currentRole}.`,
            {currentRole: currentRole, allowRoles: allowRoles})
        );
      }
    }

    if (Array.isArray(denyRoles)) {
      if (denyRoles.indexOf(currentRole) !== -1) {

        return Promise.reject(
          defaultOptions.errorFormater('ACCESS_DENIED', `This action not allowed for role ${currentRole}.`,
            {currentRole: currentRole, denyRoles: denyRoles})
        );
      } else {
        return Promise.resolve(true);
      }
    }
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

  execute(params, context, options) {
    if (context) {
      this.context = context;
    }
    if (params) {
      this.params = params;
    }
    if (options) {
      this.options = Object.assign({}, defaultOptions, options);
    }
    //run all promises in series mode
    return [this.before, this.validateParams, this.checkAcckess, this.process, this.after]
      .reduce((pacc, fn) => {
        return pacc = pacc.then(fn.bind(this));
      }, Promise.resolve())
  }

}

class Contoller {

  constructor(context, options) {
    this.context = context || {};
    this.options = options || {};
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

  getActionInstance(actionName, params, options) {
    return this.getActionClass(actionName)
      .then((ActionClass) => {
        let actionOptions = Object.assign({}, this.options, options, {ctrl: this});
        return (new ActionClass(this.context, params, actionOptions));
      });
  }

  before(action) {
    return Promise.resolve(action);
  }

  process(action) {
    return action.execute();
  }

  after(result) {
    return Promise.resolve(result);
  }

  callAction(actionName, params, options) {
    return this.getActionInstance(actionName, params, options)
      .then(this.before.bind(this))
      .then(this.process.bind(this))
      .then(this.after.bind(this));
  }
}

class Dispatcher {

  constructor(controllers, options) {
    this.options = options || {};
    this._controllers = controllers || {};
    this._aliases = {};
  }

  addController(name, ctrlClass) {
    this._controllers[name] = ctrlClass;
  }

  parseCommandName(command) {
    if (typeof command !== 'string') {
      return Promise.reject(defaultOptions.errorFormater('INVALID_COMMAND_NAME', 'Argument "command" must be a string.'));
    }
    let parts = command.split('.');
    if (parts.length < 2) {
      return Promise.reject(defaultOptions.errorFormater('INVALID_COMMAND_NAME', 'Command name must be a string in format <controller>.<action>.'));
    }
    let result = {
      command: command,
      ctrlName: parts[0],
      actionName: parts[1]
    };
    if (!this._controllers.hasOwnProperty(result.ctrlName)) {
      return Promise.reject(defaultOptions.errorFormater('INVALID_COMMAND_NAME', `Not found handler for command ${result.command}`, result));
    }
    result.ctrlClass = this._controllers[result.ctrlName];

    return Promise.resolve(result);
  }

  addAlias(name, options) {
    if (typeof options === 'string') {
      options = {command: options};
    }
    this._aliases[name] = Object.assign({}, options);
  }

  handleAlias(alias, context, params, options) {
    let aliasOptions = this._aliases[alias];
    return this.parseCommandName(aliasOptions.command);
  }

  execute(command, context, params, options) {

    let executor = (commandInfo) => {
      options || (options = {});
      commandInfo.originalCommand = command;
      options.commandInfo = commandInfo;

      let controller = new commandInfo.ctrlClass(context, options);
      return controller.callAction(commandInfo.actionName, params, options);
    };

    if (this._aliases.hasOwnProperty(command)) {
      return this.handleAlias(command, context, params, options).then(executor)
    }

    return this.parseCommandName(command, context, params, options).then(executor);
  }

  executeBulk(context, commands, options) {

    let executor = (command, params, options) => {
      return new Promise((resolve, reject) => {
        this.execute(command, context, params, options).then(resolve, resolve);
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
module.exports.Action = Action;
module.exports.Contoller = Contoller;
module.exports.Dispatcher = Dispatcher;
