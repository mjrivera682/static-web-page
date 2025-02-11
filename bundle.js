/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./src/scripts/app.js":
/*!****************************!*\
  !*** ./src/scripts/app.js ***!
  \****************************/
/***/ (() => {

eval("const apiUrl = 'https://api.example.com/data'; // Replace with your API endpoint\n\nasync function fetchData() {\n    try {\n        const response = await fetch(apiUrl);\n        if (!response.ok) {\n            throw new Error('Network response was not ok');\n        }\n        const data = await response.json();\n        updateDOM(data);\n    } catch (error) {\n        console.error('There has been a problem with your fetch operation:', error);\n    }\n}\n\nfunction updateDOM(data) {\n    const container = document.getElementById('data-container');\n    container.innerHTML = ''; // Clear previous content\n\n    data.forEach(item => {\n        const div = document.createElement('div');\n        div.className = 'data-item';\n        div.textContent = item.name; // Adjust based on your data structure\n        container.appendChild(div);\n    });\n}\n\ndocument.getElementById('login-button').addEventListener('click', function() {\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n        <form id=\"login-form\">\n            <label for=\"email\">Email:</label>\n            <input type=\"email\" id=\"email\" name=\"email\" required>\n            <label for=\"password\">Password:</label>\n            <input type=\"password\" id=\"password\" name=\"password\" required>\n            <button type=\"submit\">Submit</button>\n        </form>\n    `;\n    document.getElementById('login-form').addEventListener('submit', function(event) {\n        event.preventDefault();\n        \n        // Obtener los valores de los inputs\n        const email = document.getElementById('email').value;\n        const password = document.getElementById('password').value;\n\n        // Crear el objeto JSON\n        const data = {\n            mail: email,\n            password: password\n        };\n        console.log(\"device:\",device);\n        indigitall.InApp.logIn(\"YOUR_ID\", (hash)=>{\n          //DO SOMETHING\n     }, (error)=>{\n         //LOG ERROR\n     });\n     \n    });\n});\n\ndocument.getElementById('signup-button').addEventListener('click', function() {\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n      <form id=\"signup-form\">\n        <label for=\"name\">Name:</label>\n        <input type=\"text\" id=\"name\" name=\"name\" required autocomplete=\"name\">\n        <label for=\"birthdate\">Birthdate:</label>\n        <input type=\"date\" id=\"birthdate\" name=\"birthdate\" required autocomplete=\"bday\">\n        <button type=\"submit\">Submit</button>\n      </form>\n    `;\n  \n    document.getElementById('signup-form').addEventListener('submit', function(event) {\n      event.preventDefault();\n  \n      // Obtener los valores de los inputs\n      const nameValue = document.getElementById('name').value;\n      const birthdateValue = document.getElementById('birthdate').value;\n  \n      // Crear un objeto JSON con la información\n      const customData = {\n        name: nameValue,\n        birthdate: birthdateValue\n      };\n  \n      // Enviar el evento con los datos personalizados\n      indigitall.sendCustomEvent({\n        eventType: \"step1\",\n        customData: customData, // Se envía el objeto JSON con Name y Birthdate\n        async: false, // Llamada sincrónica (ajusta según necesidad)\n      }, (response) => {\n        // Acciones a realizar al recibir respuesta\n        console.log('Custom event sent successfully:', response);\n      }, (error) => {\n        // Registro de error\n        console.error('Error sending custom event:', error);\n      });\n      \n      loadEmails();\n    });\n  });\n\nfunction replaceButtonsWithLogout() {\n    const header = document.querySelector('header');\n    header.innerHTML = '<button id=\"logout-button\">Logout</button>';\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n         <p>You are logged in.</p>\n    `;\n    document.getElementById('logout-button').addEventListener('click', function() {\n      //Disconnection\n      indigitall.logOut((device)=>{\n        //DO SOMETHING\n      }, (error)=>{\n        //LOG ERROR\n      }); \n      location.reload();\n    });\n}\n\nfunction onIndigitallInitialized(permissions, device) {\n  console.log(\"Device: \", device) // Initialization logic\n}\n\nfunction loadEmails() {\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n        <form id=\"email-form\">\n            <label for=\"email1\">Email:</label>\n            <input type=\"email\" id=\"email1\" name=\"email1\" required>\n            <label for=\"email2\">Email2:</label>\n            <input type=\"email\" id=\"email2\" name=\"email2\" required>\n            <button type=\"submit\">Submit</button>\n        </form>\n    `;\n\n    // Add the event listener after the form is created\n    document.getElementById('email-form').addEventListener('submit', function(event) {\n        event.preventDefault();\n\n        // Obtener los valores de los inputs\n        const email1Value = document.getElementById('email1').value;\n        const email2Value = document.getElementById('email2').value;\n\n        // Crear un objeto JSON con la información\n        const customData = {\n            email1: email1Value,\n            email2: email2Value\n        };\n\n        indigitall.topicsUnsubscribe([\"incomplete_step2\"]);\n\n        // Enviar el evento con los datos personalizados\n        indigitall.sendCustomEvent({\n            eventType: \"step2\",\n            customData: customData, // Se envía el objeto JSON con Name y Birthdate\n            async: false, // Llamada sincrónica (ajusta según necesidad)\n        }, (response) => {\n            // Acciones a realizar al recibir respuesta\n            console.log('Custom event sent successfully:', response);\n        }, (error) => {\n            // Registro de error\n            console.error('Error sending custom event:', error);\n        });\n\n        emailforms();\n    });\n}\n\nfunction emailforms() {\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n        <form id=\"pass-form\">\n            <label for=\"password1\">Password:</label>\n            <input type=\"password\" id=\"password1\" name=\"password1\" required>\n            <label for=\"password2\">Password:</label>\n            <input type=\"password\" id=\"password2\" name=\"password2\" required>\n            <button type=\"submit\">Submit</button>\n        </form>\n    `;\n\n    document.getElementById('pass-form').addEventListener('submit', function(event) {\n        event.preventDefault();\n\n        // Obtener los valores de los inputs\n        const password1Value = document.getElementById('password1').value;\n        const password2Value = document.getElementById('password2').value;\n\n        // Crear un objeto JSON con la información\n        const customData = {\n            password1: password1Value,\n            password2: password2Value\n        };\n\n        // Enviar el evento con los datos personalizados\n        indigitall.sendCustomEvent({\n            eventType: \"step3\",\n            customData: customData, // Se envía el objeto JSON con Name y Birthdate\n            async: false, // Llamada sincrónica (ajusta según necesidad)\n        }, (response) => {\n            // Acciones a realizar al recibir respuesta\n            console.log('Custom event sent successfully:', response);\n        }, (error) => {\n            // Registro de error\n            console.error('Error sending custom event:', error);\n        });\n\n        registeredEmails();\n    });\n}\n\nfunction registeredEmails() {\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n         <p>Your emails were registered.</p>\n    `;\n}\n\n\n\n//# sourceURL=webpack://static-web-page/./src/scripts/app.js?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./src/scripts/app.js"]();
/******/ 	
/******/ })()
;