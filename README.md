# Simple REST Data Provider for React Admin - Strapi
[React Admin](https://marmelab.com/react-admin/) data provider for Strapi.js.

# Usage
Save the **index.js** file as ra-strapi-rest.js and import it in your react-admin project. No need to npm install another dependency :)
```js
import React from 'react';
import { fetchUtils, Admin, Resource } from 'react-admin';
import simpleRestProvider from './ra-strapi-rest';
```

# IMPORTANT! Strapi Content-Range Header Setup
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
  ctx.set('Content-Range', await strapi.services.<Model_Name>.count());
  if (ctx.query._q) {
    return strapi.services.<Model_Name>.search(ctx.query);
  } else {
    return strapi.services.<Model_Name>.find(ctx.query);
  }
},
...
```
Example:
```js
...
find: async (ctx) => {
  ctx.set('Content-Range', await strapi.services.Post.count());
  if (ctx.query._q) {
    return strapi.services.post.search(ctx.query);
  } else {
    return strapi.services.post.find(ctx.query);
  }
},
...
```

# Strapi Beta - Controllers
In the Beta version of Strapi, controllers are abstracted away, and the files are empty. How do we add the **Content-Range** header now??
The solution is simple: just extend the **find** method of each controller.

Say you have a Strapi API `/post` and corresponding `Post.js` controller file. But the file is empty
```js
// api/post/controllers/Post.js
'use strict'

module.exports = {};
```

According to the [Strapi Documentation](https://strapi.io/documentation/3.0.0-beta.x/concepts/controllers.html#core-controllers), when you create a new Content or model, Strapi builds a generic controller for your models by default and allows you to override and extend it in the generated file. 

So to make the React-Admin work, we have to extend the find method of the `post` controller. 

```js
// api/post/controllers/Post.js

'use strict';
const { sanitizeEntity } = require('strapi-utils');

module.exports = {
  async find(ctx) {
    let entities;
    ctx.set('Content-Range', await strapi.services.post.count()); // <--- Add this guy
    if (ctx.query._q) {
      entities = await strapi.services.post.search(ctx.query);
    } else {
      entities = await strapi.services.post.find(ctx.query);
    }

    return entities.map(entity =>
      sanitizeEntity(entity, { model: strapi.models.post })
    );
  },
};
```
Note that my model name is called `post` here. Replace it with whatever content you are dealing with.

The content-range header is required only for the `find` method

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
import Cookies from './helpers/Cookies';

import { PostList } from './posts';

const httpClient = (url, options = {}) => {
    if (!options.headers) {
        options.headers = new Headers({ Accept: 'application/json' });
    }
    const token = Cookies.getCookie('token')
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

# Example of a working authProvider.js

```js
// authProvider.js

import Cookies from './helpers/Cookies'

export default {

    login: ({ username, password }) => {
        const identifier = username // strapi expects 'identifier' and not 'username'
        const request = new Request('http://localhost:1337/auth/local', {
            method: 'POST',
            body: JSON.stringify({ identifier, password }),
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
                Cookies.setCookie('token', response.jwt, 1);
                Cookies.setCookie('role', response.user.role.name, 1);
            });
    },

    logout: () => {
        Cookies.deleteCookie('token');
        Cookies.deleteCookie('role');
        return Promise.resolve();
    },

    checkAuth: () => {
        return Cookies.getCookie('token') ? Promise.resolve() : Promise.reject();
    },

    checkError: ({ status }) => {
        if (status === 401 || status === 403) {
            Cookies.deleteCookie('token');
            Cookies.deleteCookie('role');
            return Promise.reject();
        }
        return Promise.resolve();
    },

    getPermissions: () => {
        const role = Cookies.getCookie('role');
        return role ? Promise.resolve(role) : Promise.reject();
    },
}

// ====================
// helpers/Cookies.js

const Cookies = {
	getCookie: (name) => {
		const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
    		return v ? v[2] : null;
	},

	setCookie: (name, value, days) => {
		var d = new Date();
    		d.setTime(d.getTime() + 24*60*60*1000*days);
    		document.cookie = name + "=" + value + ";path=/;expires=" + d.toGMTString();
	},

	deleteCookie: (name) => {
		Cookies.setCookie(name, '', -1)
	}
};

export default Cookies;
```
Using cookies instead of localStorage because localStorage does not play well with private browsing

# File Upload
In order to use `ImageInput` or `FileInput` features of the React-Admin, you need to provide the names of the upload fields to the data provider.

Steps
1. Get the latest version of the index.js from the repo
2. In `App.js` add a new array `uploadFields` and add the fields that are handling file upload for your resources. 

For example, say you have this `post` model
```json
// <strapi_project>/api/post/models/post.settings.json
...
    "images": {
      "collection": "file",
      "via": "related",
      "plugin": "upload"
    },
    "files": {
      "collection": "file",
      "via": "related",
      "plugin": "upload"
    },
    "avatar": {
      "model": "file",
      "via": "related",
      "plugin": "upload"
    }
...
```

And this Edit component for `posts` in React-Admin

```js
export const PostEdit = props => (
   <Edit title="Article" {...props}>
      <SimpleForm>
         <TextInput source="title" />
	 <TextInput source="body" />
	 <BooleanInput source="published" />
	 <ImageInput
	     multiple={true}
   	     source="images"
	     label="Related pictures"
	     accept="image/*"
	 >
	     <ImageField source="url" title="name" />
	 </ImageInput>
	 <ImageInput source="avatar" label="Avatar" accept="image/*">
             <ImageField source="url" title="name" />
	 </ImageInput>
	 <FileInput source="files" label="Related files" multiple={true}>
             <FileField source="url" title="name" />
	 </FileInput>
      </SimpleForm>
   </Edit>
);
```
Then there are 3 fields that require file upload feature - _images_, _files_, and _avatar_.

So we need to pass those field names to the data provider.
```js
// App.js
...
const  uploadFields = ["images", "files", "avatar"];
const  dataProvider = simpleRestProvider(baseUrl, httpClient, uploadFields);
...
```
If the same name exists for multiple resources, **just mention it once**. Data provider will take care of the rest. 

**NOTE**: Do not pass the resource names, only the field names inside the resources.
