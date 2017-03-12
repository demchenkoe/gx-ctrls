
Perfect nodejs library for abstract your handlers from framework and from transport of incomming requests.  
Include check user roles and validator for incomming parameters (used [ValidatorJS](https://validatejs.org/) ).

#### Install library


	npm install gx-ctrls

#### Inlude library

	var ctrls = require('gx-ctrls');

#### Define actions

See [ValidatorJS constraints](https://validatejs.org/#constraints) for information about constraints structure.

		class SayHelloAction extends ctrls.Action {

			get paramsConstraints() {
				return {
					userName: {
						presence: true
					}
				}
			}
			
			get allowRoles() {
					return ['ADMIN'] 
			}

			process () {
				return Promise.resolve(`Hello ${this.params.userName}`);
			}
		}
		
		class SayByeAction extends ctrls.Action {
      process () {
        return Promise.resolve('Bye');
      }
    }

#### Run action without controller and dispatcher
     
     (new SayHelloAction(context, { userName: "John Doe" })).execute()
       .then(
         (result) => { console.log('result',result); },
         (err) => { console.log("error", err); }
       );

#### Define controller with actions

		class HelloController extends ctrls.Contoller {
			get actions () {
				return {
					'sayHello': SayHelloAction,
					'sayBye': SayByeAction
				}
			}
		}


#### Run sayHello with validation incomming parameters and with check user role

		var context = { user: { role: 'ADMIN'} };
		var params = { userName: "John Doe" };

		var ctrl = new HelloController(context);
		ctrl.callAction('sayHello', params)
			.then(
				(result) => { console.log('result',result); },
				(err) => { console.log("error", err); }
			);
			
			
#### Use Dispatcher
     
     let dispatcher = new ctrls.Dispatcher();
     
     dispatcher.addController('Hello', HelloController);
     
     dispatcher.execute('Hello.sayHello', context, { userName: "John Doe" })
       .then(
         (result) => { console.log('result',result); },
         (err) => { console.log("error", err); }
       );
       
#### Use Dispatcher aliases for commands
       
       dispatcher.addAlias('Greetings.show', 'Hello.sayHello');
       
       dispatcher.execute('Greetings.show', context, { userName: "John Doe" })
         .then(
           (result) => { console.log('result',result); },
           (err) => { console.log("error", err); }
         );
         
### Use Dispatcher for bulk commands
                  
         
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
			
												
#### Implementation with ExpressJS

Use **req** as context and **req.query** as params. 
												
		var app = express();
		app.get('/api/hello/say?userName=John', function(req, res) {
			var ctrl = new HelloController(req);
			ctrl.callAction('sayHello', req.query)
				.then(
					(result) => { res.json(result); },
					(err) => { res.json(err); }
				);
		});
														
#### Implementation with Socket.io
														
														
		var io = require('socket.io')();
		io.on('connection', function(socket) {
		
				socket.on('signin', function(data) {
						if(data.login === 'admin' && data.password === 'secret') {
							socket.user = { username: 'admin', role: 'ADMIN' }
						}
				});
		
				socket.on('command', function(data) {
				var ctrl = new HelloController(socket);
				ctrl.callAction('sayHello', data)
					.then(
						(result) => { socket.emit('commandResponse', result); },
						(err) => { socket.emit('commandResponse', err); }
					);
				});
			
		});