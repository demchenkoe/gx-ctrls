
Perfect nodejs library for abstract your handlers from framework and from transport of incomming requests.  
Include check user roles and validator for incomming parameters (used [ValidatorJS](https://validatejs.org/) ).

#### Install library


	npm install gx-ctrls

#### Inlude library

	var gxCtrls = require('gx-ctrls');

#### Define action

See [ValidatorJS constraints](https://validatejs.org/#constraints) for information about constraints structure.

		class SayHelloAction extends gxCtrls.Action {

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

			_run () {
				return Promise.resolve(`Hello ${this.params.userName}`);
			}
		}

#### Define controller with SayHelloAction

		class HelloController extends gxCtrls.Contoller {
			get actions () {
				return {
					'sayHello': SayHelloAction
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