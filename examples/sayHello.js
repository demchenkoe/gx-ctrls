/**
 * Autor Eugene Demchenko <demchenkoev@gmail.com>
 * Created on 11.03.17.
 * License BSD
 */
'use strict';

var gxCtrls = require('../index');

class SayHelloAction extends gxCtrls.Action {

  get paramsConstraints() {
    return {
      userName: {
        presence: true
      }
    }
  }

  _run () {
    return Promise.resolve(`Hello ${this.params.userName}`);
  }
}

class HelloController extends gxCtrls.Contoller {
  get actions () {
    return {
      'sayHello': SayHelloAction
    }
  }
}


var ctrl = new HelloController();
ctrl.callAction('sayHello', { userName: "John Doe" })
  .then(
    (result) => { console.log('result',result); },
    (err) => { console.log("error", err); }
  );

ctrl.callAction('sayHello')
  .then(
    (result) => { console.log('result',result); },
    (err) => { console.log("error", err); }
  );