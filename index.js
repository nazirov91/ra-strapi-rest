import {
    fetchUtils,
    GET_LIST,
    GET_ONE,
    GET_MANY,
    GET_MANY_REFERENCE,
    CREATE,
    UPDATE,
    UPDATE_MANY,
    DELETE,
    DELETE_MANY,
} from 'react-admin';

/**
 * Maps react-admin queries to a simple REST API
 * @example
 * GET_LIST     => GET http://my.api.url/posts?sort=['title','ASC']&range=[0, 24]
 * GET_ONE      => GET http://my.api.url/posts/123
 * GET_MANY     => GET http://my.api.url/posts?filter={ids:[123,456,789]}
 * UPDATE       => PUT http://my.api.url/posts/123
 * CREATE       => POST http://my.api.url/posts
 * DELETE       => DELETE http://my.api.url/posts/123
 */
export default (apiUrl, httpClient = fetchUtils.fetchJson, uploadFields = []) => {
    /**
     * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
     * @param {String} resource Name of the resource to fetch, e.g. 'posts'
     * @param {Object} params The data request params, depending on the type
     * @returns {Object} { url, options } The HTTP request parameters
     */
    const convertDataRequestToHTTP = (type, resource, params) => {
        let url = '';
        const options = {};
        switch (type) {
            case GET_LIST:
            case GET_MANY_REFERENCE:
                url = `${apiUrl}/${resource}?${adjustQueryForStrapi(params)}`;
                break;
            case GET_ONE:
                url = `${apiUrl}/${resource}/${params.id}`;
                break;
            case UPDATE:
                url = `${apiUrl}/${resource}/${params.id}`;
                options.method = 'PUT';
                // Omit created_at/updated_at(RDS) and createdAt/updatedAt(Mongo) in request body
                const {created_at, updated_at, createdAt, updatedAt, ...data} = params.data;
                options.body = JSON.stringify(data);
                break;
            case CREATE:
                url = `${apiUrl}/${resource}`;
                options.method = 'POST';
                options.body = JSON.stringify(params.data);
                break;
            case DELETE:
                url = `${apiUrl}/${resource}/${params.id}`;
                options.method = 'DELETE';
                break;
            default:
                throw new Error(`Unsupported fetch action type ${type}`);
        }
        return { url, options };
    };

    const adjustQueryForStrapi = (params) => {

        /*
        params = { 
            pagination: { page: {int} , perPage: {int} }, 
            sort: { field: {string}, order: {string} }, 
            filter: {Object}, 
            target: {string}, (REFERENCE ONLY)
            id: {mixed} (REFERENCE ONLY)
        }
        */

        // Handle SORTING
        const s = params.sort;
        const sort = s.field === "" ? "_sort=updated_at:DESC" : ("_sort=" + s.field + ":" + s.order);

        // Handle FILTER
        const f = params.filter;
        let filter = "";
        const keys = Object.keys(f);
        for(let i = 0; i < keys.length; i++){
            //react-admin uses q filter in several components and strapi use _q
            if (keys[i] === "q" && f[keys[i]] !== '') {
                filter += "_q=" + f[keys[i]] + (keys[i + 1] ? "&" : "")
            } else {
                filter += keys[i] + "=" + f[keys[i]] + (keys[i + 1] ? "&" : "");
            }
        }
        if(params.id && params.target && params.target.indexOf('_id') !== -1){
            const target = params.target.substring(0, params.target.length - 3);
            filter += "&" + target + "=" + params.id;
        }

        // Handle PAGINATION
        const { page, perPage } = params.pagination;
        const start = (page - 1) * perPage;
        const limit = perPage;//for strapi the _limit params indicate the amount of elements to return in the response
        const range = "_start=" + start + "&_limit=" + limit;

        return sort + "&" + range + "&" + filter; 
    }
    
    // Determines if there are new files to upload
    const determineUploadFieldNames = params => {
	if (!params.data) return [];

	// Check if the field names are mentioned in the uploadFields
	// and verify there are new files being added
	const requestUplaodFieldNames = [];
	Object.keys(params.data).forEach(field => {
	   let fieldData = params.data[field];
	   if (uploadFields.includes(field)) {
	      fieldData = !Array.isArray(fieldData) ? [fieldData] : fieldData;
	      fieldData.filter(f => f && f.rawFile instanceof File).length > 0 
		  && requestUplaodFieldNames.push(field);
	   }
	});
	
	// Return an array of field names where new files are added
	return requestUplaodFieldNames;
     };
    
    // Handles file uploading for CREATE and UPDATE types
    const handleFileUpload = (type, resource, params, uploadFieldNames) => {
	const { created_at, updated_at, createdAt, updatedAt, ...data } = params.data;
	const id = type === UPDATE ? `/${params.id}` : "";
	const url = `${apiUrl}/${resource}${id}`;
	const requestMethod = type === UPDATE ? "PUT" : "POST";
	const formData = new FormData();

	for (let fieldName of uploadFieldNames) {
	    let fieldData = params.data[fieldName];
	    fieldData = !Array.isArray(fieldData) ? [fieldData] : fieldData;
	    const existingFileIds = [];
	    
	    for (let item of fieldData) {
		item.rawFile instanceof File
		  ? formData.append(`files.${fieldName}`, item.rawFile)
		  : existingFileIds.push(item.id || item._id);
	    }

	    data[fieldName] = [...existingFileIds];
	}
	formData.append("data", JSON.stringify(data));

	return httpClient(url, {
	    method: requestMethod,
	    body: formData
	}).then(response => ({ data: replaceRefObjectsWithIds(response.json) }));
    };
    
    // Replace reference objects with reference object IDs	
    const replaceRefObjectsWithIds = json => {
    	Object.keys(json).forEach(key => {
	    const fd = json[key]; // field data
	    const referenceKeys = [];
	    if (fd && (fd.id || fd._id) && !fd.mime) {
	        json[key] = fd.id || fd._id;
	    } else if (Array.isArray(fd) && fd.length > 0 && !fd[0].mime) {
	        fd.map(item => referenceKeys.push(item.id || item._id));
	        json[key] = referenceKeys;
	    }
	});
	return json;
    }

    /**
     * @param {Object} response HTTP response from fetch()
     * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
     * @param {String} resource Name of the resource to fetch, e.g. 'posts'
     * @param {Object} params The data request params, depending on the type
     * @returns {Object} Data response
     */
    const convertHTTPResponse = (response, type, resource, params) => {
        const { headers, json, total } = response;
        switch (type) {
	    case GET_ONE:
	        return { data: replaceRefObjectsWithIds(json) };
            case GET_LIST:
            case GET_MANY_REFERENCE:
                return {
                    data: json,
                    total
                };
            case CREATE:
                return { data: { ...params.data, id: json.id } };
            case DELETE:
                return { data: { id: null } };
            default:
                return { data: json };
        }
    };

    /**
     * @param {string} type Request type, e.g GET_LIST
     * @param {string} resource Resource name, e.g. "posts"
     * @param {Object} payload Request parameters. Depends on the request type
     * @returns {Promise} the Promise for a data response
     */
    return (type, resource, params) => {
        
        // Handle file uploading
	const uploadFieldNames = determineUploadFieldNames(params);
	if (uploadFieldNames.length > 0) {
	    return handleFileUpload(type, resource, params, uploadFieldNames);
	}
        
        // simple-rest doesn't handle filters on UPDATE route, so we fallback to calling UPDATE n times instead
        if (type === UPDATE_MANY) {
            return Promise.all(
                params.ids.map(id => {
                    // Omit created_at/updated_at(RDS) and createdAt/updatedAt(Mongo) in request body
                    const {created_at, updated_at, createdAt, updatedAt, ...data} = params.data;
                    return httpClient(`${apiUrl}/${resource}/${id}`, {
                        method: 'PUT',
                        body: JSON.stringify(data),
                    })
                })
            ).then(responses => ({
                data: responses.map(response => response.json),
            }));
        }
        // simple-rest doesn't handle filters on DELETE route, so we fallback to calling DELETE n times instead
        if (type === DELETE_MANY) {
            return Promise.all(
                params.ids.map(id =>
                    httpClient(`${apiUrl}/${resource}/${id}`, {
                        method: 'DELETE',
                    })
                )
            ).then(responses => ({
                data: responses.map(response => response.json),
            }));
        }
        //strapi doesn't handle filters in GET route
        if (type === GET_MANY) {
            return Promise.all(
                params.ids.map(i =>
                    httpClient(`${apiUrl}/${resource}/${i.id || i._id || i}`, {
                        method: 'GET',
                    })
                )
            ).then(responses => ({
                data: responses.map(response => response.json),
            }));
        }

        const { url, options } = convertDataRequestToHTTP(
            type,
            resource,
            params
        );

        // Get total via model/count endpoint
        if (type === GET_MANY_REFERENCE || type === GET_LIST) {
            const { url: urlForCount } = convertDataRequestToHTTP(
                type,
                resource + "/count",
                params
            );
            return Promise.all([
                httpClient(url, options),
                httpClient(urlForCount, options),
            ]).then(promises => {
                const response = {
                    ...promises[0],
                    // Add total for further use
                    total: parseInt(promises[1].json, 10),
                };
                return convertHTTPResponse(response, type, resource, params);
            });
        } else {
            return httpClient(url, options).then((response) =>
                convertHTTPResponse(response, type, resource, params)
            );
        }
    };
}; 
