/**
 * Autor Eugene Demchenko <demchenkoev@gmail.com>
 * Created on 11.03.17.
 * License BSD
 */
'use strict';

let ctrls = require('../index');
let context = {user: {role: 'ADMIN'}};

function outputResult(result) {
  console.log('result', result);
}
function outputError(err) {
  console.log("error", err);
}


class SayHelloAction extends ctrls.Action {

  get paramsConstraints() {
    return {
      userName: {
        presence: true
      }
    }
  }

  process() {
    var message = `Hello ${this.params.userName}.`;
    var role = this.pickRoleFromContext();
    if (role === 'ADMIN') {
      message += ' You have administrator rights.';
    }
    return Promise.resolve(message);
  }
}

//Run action without controller and dispatcher

(new SayHelloAction())
  .execute(context, {userName: "John Doe"})
  .then(outputResult, outputError);



//Run action with controller

class SayByeAction extends ctrls.Action {
  process() {
    return Promise.resolve('Bye');
  }
}

class HelloController extends ctrls.Contoller {
  get actions() {
    return {
      'sayHello': SayHelloAction,
      'sayBye': SayByeAction
    }
  }
}

let controller = new HelloController();

controller
  .execute(context, 'sayHello', {userName: "John Doe"})
  .then(outputResult, outputError);


//Run action with dispatcher

let dispatcher = new ctrls.Dispatcher();

dispatcher
  .addController('Hello', HelloController);

dispatcher
  .execute(context, 'Hello.sayHello', {userName: "John Doe"})
  .then(outputResult, outputError);


//Run action by alias

dispatcher.addAlias('Greetings.show', 'Hello.sayHello');

dispatcher.execute(context, 'Greetings.show', {userName: "John Doe"})
  .then(outputResult, outputError);


//Execute bulk

let commandsToExecute = [
  {command: 'Hello.sayHello', params: {userName: "John Doe"}},
  {command: 'command.with.Error'},
  {command: 'Hello.sayBye'}
];

dispatcher
  .executeBulk(context, commandsToExecute)
  .then((results) => {
    results.forEach((result) => {
      console.log(result);
    });
  }, outputError);

/* Output results:

 Hello John Doe. You have administrator rights.
 { error: { code: 'INVALID_COMMAND_NAME', ... },
 Bye

 */

// Use ACL  @see https://github.com/djvirgen/virgen-acl

let Acl = ctrls.Acl;
let acl = new Acl();
let options = {acl: acl, checkAccessOnAliases: true};

acl.addResource("Hello");
acl.deny();
acl.allow('ADMIN', 'Hello');
acl.allow('UNAUTHORIZED', 'Hello', ['sayHello','sayBye']);


let params = {userName: "John Doe"};

dispatcher
  .execute(context, 'Greetings.show', params, options)
  .then(outputResult, outputError);