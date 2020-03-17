# Simple REST Data Provider for React Admin - Strapi
[React Admin](https://marmelab.com/react-admin/) data provider for Strapi.js.

# Istall
```
yarn add  devalexandre/ra-strapi-rest 
```
# Usage
create .env for apiUrl file

```
apiUrl='/src/config.js'
```

```js
import React from 'react';
import { fetchUtils, Admin, Resource } from 'react-admin';
import { strapiProviderStorage } from 'ra-strapi-rest';
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
import { strapiProviderStorage } from 'ra-strapi-rest';

import { PostList } from './posts';

const dataProvider = strapiProviderStorage('http://localhost:1337');

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
import { strapiProviderStorage , authProvider, httpClient } from 'ra-strapi-rest';


import { PostList } from './posts';



const dataProvider = strapiProviderStorage('http://localhost:1337', httpClient);

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
