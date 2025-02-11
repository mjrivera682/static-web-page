const apiUrl = 'https://api.example.com/data'; // Replace with your API endpoint

async function fetchData() {
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        updateDOM(data);
    } catch (error) {
        console.error('There has been a problem with your fetch operation:', error);
    }
}

function updateDOM(data) {
    const container = document.getElementById('data-container');
    container.innerHTML = ''; // Clear previous content

    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'data-item';
        div.textContent = item.name; // Adjust based on your data structure
        container.appendChild(div);
    });
}

document.getElementById('login-button').addEventListener('click', function() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <form id="login-form">
            <label for="email">Email:</label>
            <input type="email" id="email" name="email" required>
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required>
            <button type="submit">Submit</button>
        </form>
    `;
    document.getElementById('login-form').addEventListener('submit', function(event) {
        event.preventDefault();
        
        // Obtener los valores de los inputs
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        // Crear el objeto JSON
        const data = {
            mail: email,
            password: password
        };
        console.log("device:",device);
        indigitall.InApp.logIn("YOUR_ID", (hash)=>{
          //DO SOMETHING
     }, (error)=>{
         //LOG ERROR
     });
     
    });
});

document.getElementById('signup-button').addEventListener('click', function() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
      <form id="signup-form">
        <label for="name">Name:</label>
        <input type="text" id="name" name="name" required autocomplete="name">
        <label for="birthdate">Birthdate:</label>
        <input type="date" id="birthdate" name="birthdate" required autocomplete="bday">
        <button type="submit">Submit</button>
      </form>
    `;
  
    document.getElementById('signup-form').addEventListener('submit', function(event) {
      event.preventDefault();
  
      // Obtener los valores de los inputs
      const nameValue = document.getElementById('name').value;
      const birthdateValue = document.getElementById('birthdate').value;
  
      // Crear un objeto JSON con la información
      const customData = {
        name: nameValue,
        birthdate: birthdateValue
      };
  
      // Enviar el evento con los datos personalizados
      indigitall.sendCustomEvent({
        eventType: "step1",
        customData: customData, // Se envía el objeto JSON con Name y Birthdate
        async: false, // Llamada sincrónica (ajusta según necesidad)
      }, (response) => {
        // Acciones a realizar al recibir respuesta
        console.log('Custom event sent successfully:', response);
      }, (error) => {
        // Registro de error
        console.error('Error sending custom event:', error);
      });
      
      loadEmails();
    });
  });

function replaceButtonsWithLogout() {
    const header = document.querySelector('header');
    header.innerHTML = '<button id="logout-button">Logout</button>';
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
         <p>You are logged in.</p>
    `;
    document.getElementById('logout-button').addEventListener('click', function() {
      //Disconnection
      indigitall.logOut((device)=>{
        //DO SOMETHING
      }, (error)=>{
        //LOG ERROR
      }); 
      location.reload();
    });
}

function onIndigitallInitialized(permissions, device) {
  console.log("Device: ", device) // Initialization logic
}

function loadEmails() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <form id="email-form">
            <label for="email1">Email:</label>
            <input type="email" id="email1" name="email1" required>
            <label for="email2">Email2:</label>
            <input type="email" id="email2" name="email2" required>
            <button type="submit">Submit</button>
        </form>
    `;

    // Add the event listener after the form is created
    document.getElementById('email-form').addEventListener('submit', function(event) {
        event.preventDefault();

        // Obtener los valores de los inputs
        const email1Value = document.getElementById('email1').value;
        const email2Value = document.getElementById('email2').value;

        // Crear un objeto JSON con la información
        const customData = {
            email1: email1Value,
            email2: email2Value
        };

        indigitall.topicsUnsubscribe(["incomplete_step2"]);

        // Enviar el evento con los datos personalizados
        indigitall.sendCustomEvent({
            eventType: "step2",
            customData: customData, // Se envía el objeto JSON con Name y Birthdate
            async: false, // Llamada sincrónica (ajusta según necesidad)
        }, (response) => {
            // Acciones a realizar al recibir respuesta
            console.log('Custom event sent successfully:', response);
        }, (error) => {
            // Registro de error
            console.error('Error sending custom event:', error);
        });

        emailforms();
    });
}

function emailforms() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <form id="pass-form">
            <label for="password1">Password:</label>
            <input type="password" id="password1" name="password1" required>
            <label for="password2">Password:</label>
            <input type="password" id="password2" name="password2" required>
            <button type="submit">Submit</button>
        </form>
    `;

    document.getElementById('pass-form').addEventListener('submit', function(event) {
        event.preventDefault();

        // Obtener los valores de los inputs
        const password1Value = document.getElementById('password1').value;
        const password2Value = document.getElementById('password2').value;

        // Crear un objeto JSON con la información
        const customData = {
            password1: password1Value,
            password2: password2Value
        };

        // Enviar el evento con los datos personalizados
        indigitall.sendCustomEvent({
            eventType: "step3",
            customData: customData, // Se envía el objeto JSON con Name y Birthdate
            async: false, // Llamada sincrónica (ajusta según necesidad)
        }, (response) => {
            // Acciones a realizar al recibir respuesta
            console.log('Custom event sent successfully:', response);
        }, (error) => {
            // Registro de error
            console.error('Error sending custom event:', error);
        });

        registeredEmails();
    });
}

function registeredEmails() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
         <p>Your emails were registered.</p>
    `;
}

