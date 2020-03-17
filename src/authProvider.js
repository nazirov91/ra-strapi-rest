//import { apiUrl } from './config';
import { AUTH_LOGIN, AUTH_LOGOUT, AUTH_ERROR, AUTH_CHECK, AUTH_GET_PERMISSIONS } from 'react-admin';

const apiUrl = process.env.apiUrl || '/src/config.js';

const authProvider = (type, params) => {
   
    if (type === AUTH_LOGIN) {
        const { username, password } = params;
        const request = new Request(`${apiUrl}/auth/local`, {
            method: 'POST',
            body: JSON.stringify({ identifier:username, password }),
            headers: new Headers({ 'Content-Type': 'application/json'})
        });
        return fetch(request)
            .then(response => {
             
                if (response.status < 200 || response.status >= 300) {
                    throw new Error(response.statusText);
                    
                }
               
                return response.json();
            })
            .then(response => {
                localStorage.setItem('token', response.jwt);
                localStorage.setItem('role', response.user.role.name);
            });
    }

    if (type === AUTH_LOGOUT) {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        return Promise.resolve();
    }

    if (type === AUTH_ERROR) {
        const status  = params.status;
        if (status === 401 || status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            return Promise.reject();
        }
        return Promise.resolve();
    }

    if (type === AUTH_CHECK) {
        return localStorage.getItem('token') ? Promise.resolve() : Promise.reject();
    }

    if (type === AUTH_GET_PERMISSIONS) {
        const role = localStorage.getItem('role');
        return role ? Promise.resolve(role) : Promise.reject();
    }
    return Promise.resolve();
}


export default authProvider;