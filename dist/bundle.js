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

eval("const apiUrl = 'https://api.example.com/data'; // Replace with your API endpoint\n\nasync function fetchData() {\n    try {\n        const response = await fetch(apiUrl);\n        if (!response.ok) {\n            throw new Error('Network response was not ok');\n        }\n        const data = await response.json();\n        updateDOM(data);\n    } catch (error) {\n        console.error('There has been a problem with your fetch operation:', error);\n    }\n}\n\nfunction updateDOM(data) {\n    const container = document.getElementById('data-container');\n    container.innerHTML = ''; // Clear previous content\n\n    data.forEach(item => {\n        const div = document.createElement('div');\n        div.className = 'data-item';\n        div.textContent = item.name; // Adjust based on your data structure\n        container.appendChild(div);\n    });\n}\n\ndocument.getElementById('login-button').addEventListener('click', function() {\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n        <form id=\"login-form\">\n            <label for=\"email\">Email:</label>\n            <input type=\"email\" id=\"email\" name=\"email\" required>\n            <label for=\"password\">Password:</label>\n            <input type=\"password\" id=\"password\" name=\"password\" required>\n            <button type=\"submit\">Submit</button>\n        </form>\n    `;\n\n    document.getElementById('login-form').addEventListener('submit', function(event) {\n        event.preventDefault();\n        replaceButtonsWithLogout();\n    });\n});\n\ndocument.getElementById('signup-button').addEventListener('click', function() {\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n        <form id=\"signup-form\">\n            <label for=\"name\">Name:</label>\n            <input type=\"text\" id=\"name\" name=\"name\" required>\n            <label for=\"birthdate\">Birthdate:</label>\n            <input type=\"date\" id=\"birthdate\" name=\"birthdate\" required>\n            <button type=\"submit\">Submit</button>\n        </form>\n    `;\n\n    document.getElementById('signup-form').addEventListener('submit', function(event) {\n        event.preventDefault();\n        loadEmails();\n    });\n});\n\nfunction replaceButtonsWithLogout() {\n    const header = document.querySelector('header');\n    header.innerHTML = '<button id=\"logout-button\">Logout</button>';\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n         <p>You are logged in.</p>\n    `;\n    document.getElementById('logout-button').addEventListener('click', function() {\n        location.reload();\n    });\n}\n\n\nfunction loadEmails() {\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n        <form id=\"email-form\">\n            <label for=\"email\">Email:</label>\n            <input type=\"email\" id=\"email1\" name=\"email\" required>\n            <label for=\"email\">Email2:</label>\n            <input type=\"email\" id=\"email2\" name=\"email\" required>\n            <button type=\"submit\">Submit</button>\n        </form>\n    `;\n\n    document.getElementById('email-form').addEventListener('submit', function(event) {\n        event.preventDefault();\n        emailforms();\n    });\n\n}\n\nfunction emailforms() {\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n        <form id=\"pass-form\">\n            <label for=\"password\">Password:</label>\n            <input type=\"password\" id=\"password1\" name=\"password\" required>\n            <label for=\"password\">Password:</label>\n            <input type=\"password\" id=\"password2\" name=\"password\" required>\n            <button type=\"submit\">Submit</button>\n        </form>\n    `;\n\n    document.getElementById('pass-form').addEventListener('submit', function(event) {\n        event.preventDefault();\n        registeredEmails();\n    });\n}\n\nfunction registeredEmails() {\n    const mainContent = document.getElementById('main-content');\n    mainContent.innerHTML = `\n         <p>Your emails were registered.</p>\n    `;\n\n\n}\n\n\n\n//# sourceURL=webpack://static-web-page/./src/scripts/app.js?");

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