/* global describe, context, it, before, after, beforeEach  */

// (!!!) encoding: null to get buffer,
// https://github.com/request/request/issues/823#issuecomment-59208292

// simple: false means that we don't want to reject promise if response.statusCode not 2..
const request = require('request-promise').defaults({
  encoding: null,
  simple: false,
  resolveWithFullResponse: true
})

const fs = require('fs-extra')
const config = require('config')
const Readable = require('stream').Readable

const host = 'http://127.0.0.1:3000'

const server = require('../server')

// not in config, because many test dirs are possible
const fixturesRoot = __dirname + '/fixtures'

describe('Server', () => {
  before(done => {
    server.listen(3000, '127.0.0.1', done)
  })

  after(done => {
    server.close(done)
  })

  beforeEach(() => {
    fs.emptyDirSync(config.get('filesRoot'))
  })

  describe('GET /file.ext', () => {

    context('When exists', () => {
      beforeEach(() => {
        // 'before' will not do here,
        // because it works 'before tests'
        // and parent beforeEach works 'before each test', that is after before
        fs.copySync(`${fixturesRoot}/small.png`, config.get('filesRoot') + '/small.png')
      })

      it('returns 200 & the file', async function () {
        let fixtureContent = fs.readFileSync(`${fixturesRoot}/small.png`)

        const response = await request.get(`${host}/small.png`)

        response.body.equals(fixtureContent).should.be.true()
      })
    })

    context('otherwise', () => {
      it('returns 404', async function () {

        const response = await request.get(`${host}/small.png`)

        response.statusCode.should.be.equal(404)
      })

    })
  })

  describe('GET /nested/path', () => {
    it('returns 400', async function () {
      const response = await request.get(`${host}/nested/path`)

      response.statusCode.should.be.equal(400)
    })

  })

  describe('POST /file.ext', () => {

    context('When exists', () => {
      beforeEach(() => {
        fs.copySync(`${fixturesRoot}/small.png`, config.get('filesRoot') + '/small.png')
      })

      context('When small file size', () => {
        it('returns 409 & file not modified', async function () {
          const { mtime } = fs.statSync(config.get('filesRoot') + '/small.png')

          const req = request.post(`${host}/small.png`)

          fs.createReadStream(`${fixturesRoot}/small.png`).pipe(req)

          const response = await req

          const { mtime: newMtime } = fs.statSync(config.get('filesRoot') + '/small.png')

          mtime.should.eql(newMtime)

          response.statusCode.should.be.equal(409)
        })

        context('When zero file size', () => {
          it('returns 409', async function () {
            const req = request.post(`${host}/small.png`)

            // emulate zero-file
            let stream = new Readable()

            stream.pipe(req)
            stream.push(null)

            const response = await req

            response.statusCode.should.be.equal(409)
          })
        })


      })

      context('When too big', () => {

        it('return 413 and no file appears', async function () {

          fs.existsSync(config.get('filesRoot') + '/big.png').should.be.false()
          const stream = fs.createReadStream(`${fixturesRoot}/big.png`)

          const req = request.post(`${host}/big.png`)

          stream.pipe(req)

          let response

          try {
            response = await req
          } catch(err) {
            // see ctx for description https://github.com/nodejs/node/issues/947#issue-58838888
            // there is a problem in nodejs with it
            if (err.cause && err.cause.code == 'EPIPE') return

            throw err
          }

          response.statusCode.should.be.equal(413)

          fs.existsSync(config.get('filesRoot') + '/big.png').should.be.false()
        })

      })
    })

    context('otherwise with zero file size', () => {

      it('returns 200 & file is uploaded', async function () {
        const req = request.post(`${host}/small.png`) // {pipe, on, then, catch}

        let stream = new Readable()

        stream.pipe(req)
        stream.push(null)

        const response = await req

        response.statusCode.should.be.eql(200)
        fs.statSync(config.get('filesRoot') + '/small.png').size.should.equal(0)
      })

    })

    context('otherwise', () => {

      it('returns 200 & file is uploaded', async function () {
        const req = request.post(`${host}/small.png`)

        fs.createReadStream(`${fixturesRoot}/small.png`).pipe(req)

        const response = await req

        response.statusCode.should.eql(200)

        fs.readFileSync(config.get('filesRoot') + '/small.png').equals(
          fs.readFileSync(`${fixturesRoot}/small.png`)
        ).should.be.true()
      })
    })

  })

})
