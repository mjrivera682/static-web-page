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
        replaceButtonsWithLogout();
    });
});

document.getElementById('signup-button').addEventListener('click', function() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <form id="signup-form">
            <label for="name">Name:</label>
            <input type="text" id="name" name="name" required>
            <label for="birthdate">Birthdate:</label>
            <input type="date" id="birthdate" name="birthdate" required>
            <button type="submit">Submit</button>
        </form>
    `;

    document.getElementById('signup-form').addEventListener('submit', function(event) {
        event.preventDefault();
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
        location.reload();
    });
}


function loadEmails() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <form id="email-form">
            <label for="email">Email:</label>
            <input type="email" id="email1" name="email" required>
            <label for="email">Email2:</label>
            <input type="email" id="email2" name="email" required>
            <button type="submit">Submit</button>
        </form>
    `;

    document.getElementById('email-form').addEventListener('submit', function(event) {
        event.preventDefault();
        emailforms();
    });

}

function emailforms() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <form id="pass-form">
            <label for="password">Password:</label>
            <input type="password" id="password1" name="password" required>
            <label for="password">Password:</label>
            <input type="password" id="password2" name="password" required>
            <button type="submit">Submit</button>
        </form>
    `;

    document.getElementById('pass-form').addEventListener('submit', function(event) {
        event.preventDefault();
        registeredEmails();
    });
}

function registeredEmails() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
         <p>Your emails were registered.</p>
    `;


}

