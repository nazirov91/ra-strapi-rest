# Simple REST Data Provider for React Admin - Strapi
[React Admin](https://marmelab.com/react-admin/) data provider for Strapi.js.


# Strapi Content-Range Header Setup
1. Make sure CORS is enabled in Strapi project
2. Add Content-Range to expose headers object
*<your_project>/config/environments/development/security.js*
```
{
...
"cors": {
    "enabled": true,
    "origin": "*",
    "expose": [
      "WWW-Authenticate",
      "Server-Authorization",
      "Content-Range" // <<--- HERE
    ],
    ...
  },
  ...
}
```
3. In controllers, you need to set the `Content-Range` header with the total number of results to build the pagination
```js
...
find: async (ctx) => {
  ctx.set('Content-Range', await <Model_Name>.count());
  if (ctx.query._q) {
    return strapi.services.<Model_Name>.search(ctx.query);
  } else {
    return strapi.services.<Model_Name>.fetchAll(ctx.query);
  }
},
...
```
Example:
```js
...
find: async (ctx) => {
  ctx.set('Content-Range', await Post.count());
  if (ctx.query._q) {
    return strapi.services.post.search(ctx.query);
  } else {
    return strapi.services.post.fetchAll(ctx.query);
  }
},
...
```

# Usage
Save the file as ra-strapi-rest.js and import it in your react-admin project
```js
import React from 'react';
import { fetchUtils, Admin, Resource } from 'react-admin';
import simpleRestProvider from './ra-strapi-rest';
```

# Example

```js
import React from 'react';
import { Admin, Resource } from 'react-admin';
import simpleRestProvider from './ra-strapi-rest';

import { PostList } from './posts';

const dataProvider = simpleRestProvider('http://localhost:1337');

const App = () => (
    <Admin dataProvider={dataProvider}>
        <Resource name="posts" list={PostList} />
    </Admin>
);

export default App;
```

Posts file:
```js
import React from 'react';
import { List, Datagrid, TextField } from 'react-admin';

export const PostList = (props) => (
    <List {...props}>
        <Datagrid>
            <TextField source="id" />
            <TextField source="name" />
            <TextField source="description" />
        </Datagrid>
    </List>
);
```

# Usage with AuthProvider

```js
import React from 'react';
import { fetchUtils, Admin, Resource } from 'react-admin';
import simpleRestProvider from './ra-strapi-rest';
import authProvider from './authProvider'

import { PostList } from './posts';

const httpClient = (url, options = {}) => {
    if (!options.headers) {
        options.headers = new Headers({ Accept: 'application/json' });
    }
    const token = localStorage.getItem('token');
    options.headers.set('Authorization', `Bearer ${token}`);
    return fetchUtils.fetchJson(url, options);
}

const dataProvider = simpleRestProvider('http://localhost:1337', httpClient);

const App = () => (
    <Admin authProvider={authProvider} dataProvider={dataProvider}>
        <Resource name="posts" list={PostList} />
    </Admin>
);

export default App;
```

# AuthProvider not working?
Strapi User-permission plugin expects you to send username and password in the following format
```js
{
...
    identifier: 'your_username',
    password: 'password'
...
}
```
So in your front end form, the name for the username input should be **identifier**

However, an easier fix is to modify the Auth.js file
To do that, in your project folder, go to **plugins/user-permissions/controllers/Auth.js**
Then add the following line:
```js
params.identifier = params.identifier ? params.identifier : params.username;
```
above this **if** statement
```js
if (!params.identifier) {
    return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.email.provide' }] }] : 'Please provide your username or your e-mail.');
}
```

So it should look like this:
```js
...
// The identifier is required.
params.identifier = params.identifier ? params.identifier : params.username;
if (!params.identifier) {
return ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: 'Auth.form.error.email.provide' }] }] : 'Please provide your username or your e-mail.');
}
...
```
