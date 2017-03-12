/**
 * Autor Eugene Demchenko <demchenkoev@gmail.com>
 * Created on 11.03.17.
 * License BSD
 */
'use strict';

let ctrls = require('../index');
let context = { user: { role: 'ADMIN' }};

class SayHelloAction extends ctrls.Action {

  get paramsConstraints() {
    return {
      userName: {
        presence: true
      }
    }
  }

  process () {
    var message = `Hello ${this.params.userName}.`;
    var role = this.pickRoleFromContext();
    if(role === 'ADMIN') {
      message +=  ' You have administrator rights.';
    }
    return Promise.resolve(message);
  }
}

//Run action without controller and dispatcher

(new SayHelloAction(context, { userName: "John Doe" })).execute()
  .then(
    (result) => { console.log('result',result); },
    (err) => { console.log("error", err); }
  );



//Run action with controller

class SayByeAction extends ctrls.Action {
  process () {
    return Promise.resolve('Bye');
  }
}

class HelloController extends ctrls.Contoller {
  get actions () {
    return {
      'sayHello': SayHelloAction,
      'sayBye': SayByeAction
    }
  }
}

let controller = new HelloController(context);

controller.callAction('sayHello', { userName: "John Doe" })
  .then(
    (result) => { console.log('result',result); },
    (err) => { console.log("error", err); }
  );



//Run action with dispatcher

let dispatcher = new ctrls.Dispatcher();

dispatcher.addController('Hello', HelloController);

dispatcher.execute('Hello.sayHello', context, { userName: "John Doe" })
  .then(
    (result) => { console.log('result',result); },
    (err) => { console.log("error", err); }
  );


//Run action by alias

dispatcher.addAlias('Greetings.show', 'Hello.sayHello');

dispatcher.execute('Greetings.show', context, { userName: "John Doe" })
  .then(
    (result) => { console.log('result',result); },
    (err) => { console.log("error", err); }
  );

//Execute bulk

let commandsToExecute = [
  { command: 'Hello.sayHello', params:  { userName: "John Doe" } },
  { command: 'command.with.Error' },
  { command: 'Hello.sayBye'}
];

dispatcher.executeBulk(context, commandsToExecute).then((results) => {
  results.forEach((result) => {
    console.log(result);
  });
});

/* Output results:

Hello John Doe. You have administrator rights.
{ error: { code: 'INVALID_COMMAND_NAME', ... },
Bye

*/