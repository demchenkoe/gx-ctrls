/**
 * Autor Eugene Demchenko <demchenkoev@gmail.com>
 * Created on 11.03.17.
 * License BSD
 */
'use strict';

var validate = require("validate.js");

validate.formatters.api = function(errors) {
  if(!errors.length) {
    return null;
  }
  var details = {};
  errors.forEach(function(error) {
    details[error.attribute] = error.error;
  });
  return { error: { code: "INVALID_PARAMS", message: "Please send valid parameters.", details: details } };
};

class Action {
  constructor(context, params, options) {
    this.context = context || {};
    this.params = params || {};
    this.options = options || {};
  }
  validateParams () {
    if(!this.paramsConstraints) {
      return Promise.resolve(true)
    }
    return validate.async(this.params, this.paramsConstraints, {format: 'api'});
  }

  pickRoleFromContext() {
    if(this.context.role) {
      return this.context.role;
    }
    var user = this.context.user || null;
    return user && user.role ? user.role : 'UNAUTHORIZED';
  }

  checkAcckess () {
    var allowRoles, denyRoles;
    var ctrl = this.options.ctrl;

    if(Array.isArray(this.options.allowRoles)) {
      allowRoles = this.options.allowRoles;
    } else if(Array.isArray(this.allowRoles)) {
      allowRoles = this.allowRoles;
    } else if(ctrl && Array.isArray(ctrl.allowRoles)) {
      allowRoles = ctrl.allowRoles;
    }

    if(Array.isArray(this.options.denyRoles)) {
      denyRoles = this.options.denyRoles;
    } else if(Array.isArray(this.denyRoles)) {
      denyRoles = this.denyRoles;
    } else if(ctrl && Array.isArray(ctrl.denyRoles)) {
      denyRoles = ctrl.denyRoles;
    }

    if(!Array.isArray(allowRoles) && !Array.isArray(denyRoles)) {
      return Promise.resolve(true);
    }

    var userRole = this.pickRoleFromContext();
    var accessDeniedError = { error: { code: 'ACCESS_DENIED', message: `This action not allowed for role ${userRole}.`}};

    if(Array.isArray(allowRoles)) {
      if(allowRoles.indexOf(userRole) !== -1) {
        return Promise.resolve(true);
      } else {
        return Promise.reject(accessDeniedError);
      }
    }

    if(Array.isArray(denyRoles)) {
      if(denyRoles.indexOf(userRole) !== -1) {
        return Promise.reject(accessDeniedError);
      } else {
        return Promise.resolve(true);
      }
    }
  }

  _run () {
    return Promise.resolve(true);
  }

  run (context, params, options) {
    if(context) {
      this.context = context;
    }
    if(params) {
      this.params = params;
    }
    if(options) {
      this.options = options;
    }
    //run all promises in series mode
    return [this.validateParams, this.checkAcckess, this._run]
      .reduce((pacc, fn) => { return pacc = pacc.then(fn.bind(this));}, Promise.resolve());
  }

}

class Contoller {

  constructor(context, options) {
    this.context = context || {};
    this.options = options || {};
  }

  getActionClass (actionName) {
    var actions = this.actions;
    var invalidActionNameError = {error: { code: 'INVALID_METHOD_NAME', message: 'Action not found.'}};
    if(!actions || !this.actions.hasOwnProperty(actionName)) {
      return Promise.reject(invalidActionNameError);
    }
    var actionClass = this.actions[actionName];
    return Promise.resolve(actionClass);
  }

  getActionInstance(actionName, params, options) {
    return this.getActionClass(actionName)
      .then((ActionClass) => {
        var actionOptions = Object.assign({}, this.options, options, { ctrl: this });
        return (new ActionClass(this.context, params, actionOptions));
      });
  }

  callAction(actionName, params, options) {
    return this.getActionInstance(actionName, params, options)
      .then((action) => {
        return action.run();
      });
  }
}

module.exports.validate = validate;
module.exports.Contoller = Contoller;
module.exports.Action = Action;